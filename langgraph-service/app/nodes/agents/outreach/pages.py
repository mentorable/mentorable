"""
Fetching a public web page safely, and finding the email addresses on it.

Beaker keeps an email address only when it appears on a page this service has
fetched itself. So the service fetches URLs that a model handed it, which makes
this module an SSRF surface: a URL that leads to an internal address (the cloud
metadata service, a private network, localhost) must never be fetched, however
it is spelled and wherever a redirect points.

The rules, all enforced here:
- https only, on port 443, with no user:password@ part and a length cap. A host
  must be a real public name (never a bare IP address, never localhost or an
  .internal or .local name).
- Every address the host resolves to must be public: not loopback, private,
  link-local, multicast, reserved, shared (CGNAT) or a cloud metadata address,
  in IPv4 or IPv6, including IPv6 forms that embed an IPv4 address. Checked
  before every request, off the event loop, and again when the socket is
  opened (_PublicOnlyBackend), so a DNS answer that flips to a private address
  between the check and the connection (rebinding) is refused too.
- Redirects are followed by hand, at most 3, and each hop is checked again.
- 8 seconds for the whole fetch, at most 1.5 MB read (and at most 1.5 MB after
  decompression), and only text/html or text/plain.
- DNS lookups run on their own small thread pool with their own timeout, so a
  name server that never answers cannot starve the pool the rest of the
  service shares.

The page itself is hostile too. This service runs one worker, and a parse that
takes minutes stalls every student's chat and Quest while asyncio.wait_for
looks on (it cannot interrupt code that never yields). html.parser and any
regex that can backtrack over a long run are quadratic on some inputs ("<a <a
<a ..." with no ">", a long run of spaces), so a page is read by the one-pass
scanner in this module, only its first MAX_PARSE_CHARS characters, in one of
the text encodings real pages use, and on a worker thread of its own.

fetch_page returns None on anything wrong and never raises.
"""
import asyncio
import codecs
import ipaddress
import logging
import re
import socket
import zlib
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from html import unescape as _html_unescape
from typing import Optional
from urllib.parse import unquote, urljoin, urlsplit

import httpcore
import httpx

logger = logging.getLogger(__name__)

TIMEOUT_SECONDS = 8.0
MAX_BYTES = 1_500_000
# Characters of a page that are read for its text and addresses. A contact
# line sits well inside this on a real profile page; the rest of a body up to
# MAX_BYTES is only ever downloaded, never scanned.
MAX_PARSE_CHARS = 250_000
DNS_TIMEOUT_SECONDS = 5.0
MAX_REDIRECTS = 3
MAX_URL_CHARS = 2000
CONTENT_TYPES = ("text/html", "text/plain")
REDIRECT_CODES = (301, 302, 303, 307, 308)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; MentorableOutreach/1.0; checks public contact pages)",
    "Accept": "text/html,text/plain;q=0.9",
    # Only what _decompress can bound. Brotli and zstd would arrive unbounded.
    "Accept-Encoding": "gzip, deflate",
}

# Names that only mean something inside a network. A page about a professor or
# a professional never lives at one.
BLOCKED_HOSTS = {"localhost", "metadata", "metadata.google.internal", "instance-data"}
BLOCKED_SUFFIXES = (".localhost", ".local", ".internal", ".arpa", ".lan", ".home", ".corp", ".intranet")

# Cloud metadata and platform addresses. Most are already non-public, but
# Azure's platform address (168.63.129.16) is inside a public range.
METADATA_ADDRESSES = {
    ipaddress.ip_address(a) for a in (
        "169.254.169.254", "169.254.170.2", "100.100.100.200", "192.0.0.192", "168.63.129.16",
        "fd00:ec2::254",
    )
}

_IPV4_COMPATIBLE = ipaddress.ip_network("::/96")
_NAT64 = (ipaddress.ip_network("64:ff9b::/96"), ipaddress.ip_network("64:ff9b:1::/48"))

# Their own small thread pools, never the loop's shared default one. A lookup
# that never answers keeps its thread until the system resolver gives up
# (wait_for stops the waiting, not the thread), and a few of those on the
# shared pool would stall every asyncio.to_thread call in the service: Quest,
# chat, budgets. Here they can only slow other outreach lookups.
_DNS_POOL = ThreadPoolExecutor(max_workers=8, thread_name_prefix="outreach-dns")
_PARSE_POOL = ThreadPoolExecutor(max_workers=2, thread_name_prefix="outreach-parse")


@dataclass
class Page:
    url: str
    final_url: str
    title: str
    text: str
    emails: set[str] = field(default_factory=set)


# ── Addresses and names ──────────────────────────────────────────────────────

def is_public_address(value: str) -> bool:
    """True only for an address on the public internet.

    ipaddress's is_global alone is not enough: it counts multicast, IPv6
    site-local, the IPv4-compatible and NAT64 forms of a private IPv4 address,
    and Azure's platform address as global. So the embedded IPv4 address is
    unwrapped and checked, and the rest is refused explicitly.
    """
    try:
        ip = ipaddress.ip_address(str(value).split("%", 1)[0])
    except ValueError:
        return False
    if isinstance(ip, ipaddress.IPv6Address):
        if ip.ipv4_mapped is not None:
            ip = ip.ipv4_mapped
        elif ip.teredo is not None or ip.is_site_local or ip in _IPV4_COMPATIBLE:
            return False
        elif ip.sixtofour is not None:
            ip = ip.sixtofour
        elif any(ip in net for net in _NAT64):
            ip = ipaddress.IPv4Address(int(ip) & 0xFFFFFFFF)
    if ip in METADATA_ADDRESSES:
        return False
    return (ip.is_global and not ip.is_multicast and not ip.is_private and not ip.is_loopback
            and not ip.is_link_local and not ip.is_reserved and not ip.is_unspecified)


def host_allowed(host: str) -> bool:
    """A public-looking DNS name: at least two labels, an alphabetic top-level
    label, and none of the names that only exist inside a network. Bare IP
    addresses are refused in any spelling (127.1 and 2130706433 included)."""
    host = (host or "").strip().rstrip(".").lower()
    if not host or len(host) > 253 or host in BLOCKED_HOSTS or host.endswith(BLOCKED_SUFFIXES):
        return False
    if host.startswith("[") or ":" in host:
        return False
    labels = host.split(".")
    if len(labels) < 2 or any(not label for label in labels):
        return False
    tld = labels[-1]
    return tld.isalpha() or tld.startswith("xn--")


def _getaddrinfo(host: str, port: int):
    return socket.getaddrinfo(host, port, type=socket.SOCK_STREAM, proto=socket.IPPROTO_TCP)


async def public_addresses(host: str, port: int = 443) -> list[str]:
    """Every address the host resolves to, or [] when it does not resolve in
    DNS_TIMEOUT_SECONDS or any one of them is not public. The lookup runs on
    _DNS_POOL: getaddrinfo blocks, and on the event loop it would stall every
    request."""
    if not host_allowed(host):
        return []
    try:
        lookup = asyncio.get_running_loop().run_in_executor(_DNS_POOL, _getaddrinfo, host, port)
        infos = await asyncio.wait_for(lookup, DNS_TIMEOUT_SECONDS)
    except Exception as exc:
        logger.info(f"[outreach_pages] could not resolve {host}: {type(exc).__name__}")
        return []
    out: list[str] = []
    for info in infos or []:
        sockaddr = info[4] if len(info) > 4 else None
        ip = str(sockaddr[0]) if sockaddr else ""
        if not is_public_address(ip):
            logger.warning(f"[outreach_pages] refused {host}: it resolves to a non-public address")
            return []
        if ip not in out:
            out.append(ip)
    return out


def domain_of(url_or_email: str) -> str:
    """The host of a URL or the domain of an email address, lowercased and
    without a leading www. Empty when there is none."""
    if not isinstance(url_or_email, str):
        return ""
    value = url_or_email.strip()
    if "://" not in value and "@" in value:
        host = value.rsplit("@", 1)[1]
    else:
        try:
            host = urlsplit(value if "://" in value else "https://" + value).hostname or ""
        except ValueError:
            host = ""
    host = host.strip().rstrip(".").lower()
    return host[4:] if host.startswith("www.") else host


# Second-level labels under a country code that are not an organization's own
# name (cam.ac.uk, unsw.edu.au, ox.ac.uk).
_SECOND_LEVEL = {"ac", "co", "com", "edu", "gov", "net", "org", "sch", "gob", "go", "or", "ne"}


def site_of(url_or_email: str) -> str:
    """The organization's domain, near enough without the public suffix list:
    biology.usf.edu and mail.usf.edu are both usf.edu, and cam.ac.uk stays
    cam.ac.uk."""
    labels = [label for label in domain_of(url_or_email).split(".") if label]
    if len(labels) >= 3 and labels[-2] in _SECOND_LEVEL and len(labels[-1]) == 2:
        return ".".join(labels[-3:])
    return ".".join(labels[-2:])


# ── Email addresses ──────────────────────────────────────────────────────────

_EMAIL = re.compile(
    r"(?<![A-Za-z0-9._%+-])"
    r"[A-Za-z0-9](?:[A-Za-z0-9._%+-]{0,62}[A-Za-z0-9_%+-])?"
    r"@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,24}"
    r"(?![A-Za-z0-9-])"
)
# "name [at] uni [dot] edu", "name(at)uni(dot)edu", "name {at} uni.edu". Only
# the bracketed forms: a bare " at " is ordinary English ("reach me at the lab").
# Run on squashed text (one space at most anywhere), so each optional space is
# one character: a pattern opening with \s* retries from every character of a
# long run of spaces, which is quadratic.
_BRACKETED_AT = re.compile(r" ?[\[\(\{<] ?(?:at|@) ?[\]\)\}>] ?", re.IGNORECASE)
_BRACKETED_DOT = re.compile(r" ?[\[\(\{<] ?(?:dot|\.) ?[\]\)\}>] ?", re.IGNORECASE)
# Image and asset names that look like addresses (logo@2x.png).
_FILE_ENDINGS = {"png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp", "tif", "tiff", "css", "js", "pdf"}


def clean_address(value) -> Optional[str]:
    """One email address, lowercased, or None if it is not one."""
    if not isinstance(value, str):
        return None
    value = value.strip().strip(".").lower()
    if not _EMAIL.fullmatch(value):
        return None
    if value.rsplit(".", 1)[-1] in _FILE_ENDINGS:
        return None
    return value


def _emails_in_text(text: str) -> set[str]:
    text = _squash((text or "")[:MAX_PARSE_CHARS])
    text = _BRACKETED_DOT.sub(".", _BRACKETED_AT.sub("@", text))
    out = set()
    for m in _EMAIL.finditer(text):
        address = clean_address(m.group(0))
        if address:
            out.add(address)
    return out


def _cloudflare_email(encoded: str) -> Optional[str]:
    """Cloudflare's email protection: hex, the first byte XORs the rest."""
    try:
        data = bytes.fromhex(encoded.strip())
        if len(data) < 4:
            return None
        return clean_address(bytes(b ^ data[0] for b in data[1:]).decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None


def _mailto_addresses(href: str) -> set[str]:
    target = unquote(href.split(":", 1)[1].split("?", 1)[0]) if ":" in href else ""
    return {a for a in (clean_address(part) for part in target.split(",")) if a}


# Tags that sit inside a line of text. Every other tag breaks words apart, so
# "<td>Lee</td><td>Lab</td>" reads "Lee Lab", while "jane<span>@</span>usf.edu"
# (a common way to hide an address from scrapers) still reads as one address.
_INLINE = {"a", "abbr", "b", "bdi", "bdo", "code", "em", "font", "i", "kbd", "mark", "q", "s", "samp",
           "small", "span", "strong", "sub", "sup", "time", "u", "var", "wbr"}
_SKIP = {"script", "style", "noscript", "template", "svg", "iframe", "object"}


# One pass over the markup. Every search below moves forward from where the
# last one ended, and the few that can fail to find their end (an unclosed
# comment, script or tag) end the read, so no character is scanned more than
# a bounded number of times however the page is built.
_TAG_NAME = re.compile(r"[A-Za-z][^\s/>]*")
# The rest of a start tag, up to its ">". A quote opens a value only straight
# after "=" (title="a > b"), so there is exactly one way to read any tag and a
# failed match costs one pass, not a retry per way of splitting it.
_TAG_REST = re.compile(r"""(?:[^>=]|=\s*(?:"[^"]*"|'[^']*')|=(?!\s*["']))*>""")
_ATTRIBUTE = re.compile(r"""([^\s"'<>/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'<>=`]+))?""")
# Script and style hold raw text: nothing in them is markup until the end tag.
_RAW_TEXT_END = {tag: re.compile(rf"</{tag}(?=[\s/>])", re.IGNORECASE) for tag in ("script", "style")}
# A numeric reference too long to be a character. html.unescape raises on a
# decimal one past Python's 4300 digit limit.
_LONG_CHARREF = re.compile(r"&#(?:[0-9]{8,}|[xX][0-9a-fA-F]{7,});?")


def _unescape(text: str) -> str:
    try:
        return _html_unescape(_LONG_CHARREF.sub("\ufffd", text))
    except (ValueError, OverflowError):
        return text


class _PageParser:
    """Title, visible text, and the addresses hidden in links and attributes.

    feed() is the scanner described above. Unclosed markup ends the read: an
    unclosed comment or script hides the rest, as in a browser, and a "<" with
    no ">" anywhere after it leaves the rest as text."""

    def __init__(self):
        self.title_parts: list[str] = []
        self.text_parts: list[str] = []
        self.emails: set[str] = set()
        self._skip = 0
        self._in_title = False
        self._seen_title = False

    def feed(self, markup: str) -> None:
        i, n = 0, len(markup)
        quoted = True           # quote-aware tag ends, until one fails to close; then the plain next ">"
        while i < n:
            lt = markup.find("<", i)
            if lt < 0:
                self.handle_data(markup[i:])
                return
            if lt > i:
                self.handle_data(markup[i:lt])
            after = markup[lt + 1:lt + 2]
            if markup.startswith("<!--", lt):
                end = markup.find("-->", lt + 4)
                if end < 0:
                    return
                i = end + 3
            elif after in ("!", "?"):                          # a doctype, CDATA or processing instruction
                end = markup.find(">", lt + 2)
                if end < 0:
                    return
                i = end + 1
            elif after == "/":
                end = markup.find(">", lt + 2)
                if end < 0:
                    return
                name = _TAG_NAME.match(markup, lt + 2, end)
                if name:
                    self.handle_endtag(name.group(0).lower())
                i = end + 1
            elif after.isascii() and after.isalpha():
                end = -1
                if quoted:
                    rest = _TAG_REST.match(markup, lt + 1)
                    if rest:
                        end = rest.end() - 1
                    else:
                        quoted = False
                if end < 0:
                    end = markup.find(">", lt + 1)
                if end < 0:                                     # no tag can close after this point
                    self.handle_data(markup[lt:])
                    return
                tag = self._start(markup[lt + 1:end])
                i = end + 1
                if tag in _RAW_TEXT_END:
                    close = _RAW_TEXT_END[tag].search(markup, i)
                    end = markup.find(">", close.end()) if close else -1
                    if end < 0:
                        return
                    self.handle_data(markup[i:close.start()])
                    self.handle_endtag(tag)
                    i = end + 1
            else:                                               # "a < b" is text
                self.handle_data("<")
                i = lt + 1

    def _start(self, inside: str) -> Optional[str]:
        """One start tag, without its brackets. Its name when it opens an
        element, None when it closes itself ("br/")."""
        name = _TAG_NAME.match(inside)
        tag = name.group(0).lower()
        rest = inside[name.end():]
        attrs = []
        for key, value in _ATTRIBUTE.findall(rest):
            if value[:1] in ("'", '"'):
                value = value[1:-1]
            attrs.append((key.lower(), _unescape(value) if value else None))
        if rest.rstrip().endswith("/"):
            self.handle_startendtag(tag, attrs)
            return None
        self.handle_starttag(tag, attrs)
        return tag

    def handle_starttag(self, tag, attrs):
        self._attributes(tag, attrs)
        if tag in _SKIP:
            self._skip += 1
        elif tag == "title" and not self._seen_title and not self._skip:
            self._in_title = True
        elif tag not in _INLINE:
            self.text_parts.append(" ")

    def handle_startendtag(self, tag, attrs):
        self._attributes(tag, attrs)
        if tag not in _INLINE:
            self.text_parts.append(" ")

    def handle_endtag(self, tag):
        if tag in _SKIP:
            self._skip = max(0, self._skip - 1)
        elif tag == "title" and self._in_title:
            self._in_title = False
            self._seen_title = True
        elif tag not in _INLINE:
            self.text_parts.append(" ")

    def handle_data(self, data):
        if self._skip:
            return
        (self.title_parts if self._in_title else self.text_parts).append(data)

    def _attributes(self, tag, attrs):
        for name, value in attrs:
            if not value:
                continue
            if name == "href":
                href = value.strip()
                if href.lower().startswith("mailto:"):
                    self.emails |= _mailto_addresses(href)
                elif "/cdn-cgi/l/email-protection#" in href:
                    address = _cloudflare_email(href.rsplit("#", 1)[1])
                    if address:
                        self.emails.add(address)
            elif name == "data-cfemail":
                address = _cloudflare_email(value)
                if address:
                    self.emails.add(address)


def _squash(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def _parse_html(html: str) -> tuple[str, str, set[str]]:
    """(title, visible text, every address on the page), from the first
    MAX_PARSE_CHARS characters. Character references are decoded once, at the
    end, as html.parser's convert_charrefs did."""
    parser = _PageParser()
    try:
        parser.feed((html or "")[:MAX_PARSE_CHARS])
    except Exception as exc:  # keep what was read so far
        logger.info(f"[outreach_pages] html parse stopped early: {type(exc).__name__}")
    title = _squash(_unescape("".join(parser.title_parts)))[:200]
    text = _squash(_unescape("".join(parser.text_parts)))
    return title, text, parser.emails | _emails_in_text(text)


def extract_emails(html: str) -> set[str]:
    """Every address on a page: plain text, mailto: links, Cloudflare-protected
    addresses, and bracketed spellings like "jane [at] usf [dot] edu"."""
    return _parse_html(html)[2]


def page_has_email(page: Page, address: str) -> bool:
    wanted = clean_address(address)
    return bool(page and wanted and wanted in page.emails)


# ── Fetching ─────────────────────────────────────────────────────────────────

class _PublicOnlyBackend(httpcore.AsyncNetworkBackend):
    """Opens sockets only to public addresses, resolved when connecting.

    fetch_page checks the host before each request, but the connection would
    otherwise resolve the name a second time, and a hostile DNS server can
    answer differently the second time (rebinding). Here the address the
    socket uses is the address that was checked. TLS still verifies the
    certificate against the host name: httpcore passes the original name as
    server_hostname, not the IP address connected to.
    """

    def __init__(self, inner: Optional[httpcore.AsyncNetworkBackend] = None):
        self._inner = inner or httpcore.AnyIOBackend()

    async def connect_tcp(self, host, port, timeout=None, local_address=None, socket_options=None):
        addresses = await public_addresses(host, port)
        if not addresses:
            raise httpcore.ConnectError(f"refused {host}: not a public address")
        last: Exception = httpcore.ConnectError(f"could not connect to {host}")
        for ip in addresses:
            try:
                return await self._inner.connect_tcp(ip, port, timeout=timeout, local_address=local_address,
                                                     socket_options=socket_options)
            except (httpcore.ConnectError, httpcore.ConnectTimeout) as exc:
                last = exc
        raise last

    async def connect_unix_socket(self, path, timeout=None, socket_options=None):
        raise httpcore.ConnectError("unix sockets are not allowed")

    async def sleep(self, seconds):
        await self._inner.sleep(seconds)


def _client() -> httpx.AsyncClient:
    """An HTTP client that never follows redirects on its own, ignores proxy
    settings from the environment, and connects through _PublicOnlyBackend."""
    transport = httpx.AsyncHTTPTransport(retries=0)
    pool = getattr(transport, "_pool", None)
    if pool is not None and hasattr(pool, "_network_backend"):
        pool._network_backend = _PublicOnlyBackend()
    else:  # an httpx upgrade moved the pool: the check before each hop still runs
        logger.warning("[outreach_pages] could not pin connections to checked addresses")
    return httpx.AsyncClient(transport=transport, timeout=httpx.Timeout(TIMEOUT_SECONDS),
                             follow_redirects=False, trust_env=False, headers=HEADERS)


def checked_url(url) -> Optional[tuple[str, str]]:
    """(url, host) when the URL may be fetched at all, before any DNS: https on
    port 443, no userinfo, no control characters, a public-looking host name
    that httpx parses the same way. Otherwise None."""
    if not isinstance(url, str):
        return None
    url = url.strip()
    if not url or len(url) > MAX_URL_CHARS or "\\" in url or any(ord(c) <= 32 or ord(c) == 127 for c in url):
        return None
    try:
        parts = urlsplit(url)
        port = parts.port
        parsed = httpx.URL(url)
    except (ValueError, UnicodeError, httpx.InvalidURL):
        return None
    if parts.scheme.lower() != "https" or "@" in parts.netloc or parsed.userinfo:
        return None
    host = (parts.hostname or "").rstrip(".").lower()
    if port not in (None, 443) or not host_allowed(host):
        return None
    if (parsed.host or "").rstrip(".").lower() != host:     # the two parsers must agree on the host
        return None
    return url, host


def _content_type(value: Optional[str]) -> tuple[str, Optional[str]]:
    parts = (value or "").split(";")
    media = parts[0].strip().lower()
    charset = None
    for param in parts[1:]:
        key, _, val = param.partition("=")
        if key.strip().lower() == "charset":
            charset = val.strip().strip("\"'") or None
    return media, charset


def _decompress(raw: bytes, encoding: Optional[str]) -> Optional[bytes]:
    """The body as bytes, never more than MAX_BYTES however well it compresses.
    None for an encoding this module does not handle."""
    enc = (encoding or "").strip().lower()
    if enc in ("", "identity"):
        return raw[:MAX_BYTES]
    if enc in ("gzip", "x-gzip"):
        attempts = [16 + zlib.MAX_WBITS]
    elif enc == "deflate":
        attempts = [zlib.MAX_WBITS, -zlib.MAX_WBITS]    # zlib-wrapped, then raw deflate
    else:
        return None
    for wbits in attempts:
        try:
            return zlib.decompressobj(wbits).decompress(raw, MAX_BYTES)
        except zlib.error:
            continue
    return None


# The encodings real pages declare (plus every iso8859-* and cp125*). Any
# other name is read as UTF-8: punycode and idna are text codecs too, and
# decoding them is quadratic in the length of the body.
_CHARSETS = {"utf-8", "ascii", "utf-16", "utf-16-le", "utf-16-be", "shift_jis", "euc_jp", "iso2022_jp", "gb2312",
             "gbk", "gb18030", "big5", "euc_kr", "koi8-r", "koi8-u", "mac-roman", "tis-620"}


def _decode(data: bytes, charset: Optional[str]) -> str:
    """The start of the body as text: enough bytes for MAX_PARSE_CHARS
    characters in any encoding, and no more."""
    try:
        codec = codecs.lookup(charset).name if charset else "utf-8"
    except (LookupError, ValueError):
        codec = "utf-8"
    if codec not in _CHARSETS and not codec.startswith(("iso8859-", "cp125")):
        codec = "utf-8"
    return data[:MAX_PARSE_CHARS * 4].decode(codec, errors="replace")


def _read_body(data: bytes, charset: Optional[str], media: str) -> tuple[str, str, set[str]]:
    """(title, text, addresses) of a fetched body. Runs on _PARSE_POOL."""
    body = _decode(data, charset)
    if media == "text/html":
        return _parse_html(body)
    text = _squash(body[:MAX_PARSE_CHARS])
    return "", text, _emails_in_text(text)


async def _read_capped(resp: httpx.Response) -> bytes:
    buf = bytearray()
    async for chunk in resp.aiter_raw():
        buf.extend(chunk)
        if len(buf) >= MAX_BYTES:
            del buf[MAX_BYTES:]
            break
    return bytes(buf)


async def _fetch(url: str) -> Optional[Page]:
    current = url
    async with _client() as client:
        for _hop in range(MAX_REDIRECTS + 1):
            checked = checked_url(current)
            if checked is None:
                logger.info("[outreach_pages] refused a URL that is not a plain public https address")
                return None
            current, host = checked
            if not await public_addresses(host):
                return None
            async with client.stream("GET", current) as resp:
                if resp.status_code in REDIRECT_CODES:
                    location = (resp.headers.get("location") or "").strip()
                    if not location:
                        return None
                    current = urljoin(current, location)
                    continue
                if not 200 <= resp.status_code < 300:
                    logger.info(f"[outreach_pages] {host} answered {resp.status_code}")
                    return None
                media, charset = _content_type(resp.headers.get("content-type"))
                if media not in CONTENT_TYPES:
                    logger.info(f"[outreach_pages] {host} sent {media or 'no content type'}")
                    return None
                raw = await _read_capped(resp)
                encoding = resp.headers.get("content-encoding")
            data = _decompress(raw, encoding)
            if data is None:
                return None
            # Linear and capped, and still kept off the event loop.
            loop = asyncio.get_running_loop()
            title, text, emails = await loop.run_in_executor(_PARSE_POOL, _read_body, data, charset, media)
            return Page(url=url, final_url=current, title=title, text=text, emails=emails)
    logger.info("[outreach_pages] too many redirects")
    return None


async def fetch_page(url: str) -> Optional[Page]:
    """The page at url, or None if it cannot be fetched safely. Never raises
    (a cancelled caller still cancels)."""
    try:
        return await asyncio.wait_for(_fetch(url), TIMEOUT_SECONDS)
    except Exception as exc:
        logger.info(f"[outreach_pages] fetch failed: {type(exc).__name__}")
        return None
