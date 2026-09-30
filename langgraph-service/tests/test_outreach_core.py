"""
Beaker's outreach core: safe page fetching (an SSRF surface), email
verification, the research filters, and the rules every draft is held to.

Fakes only: DNS is a table, HTTP is httpx.MockTransport, the web search and the
model are scripted. Nothing here touches the network. Run from
langgraph-service/:

    python3 -m pytest tests/
"""
import asyncio
import gzip
import os
import socket
import sys
import threading
import time
import types
from types import SimpleNamespace as NS

for _k in ("SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY",
           "DATABASE_URL", "CORS_ORIGIN"):
    os.environ.setdefault(_k, "stub")
_stub = types.ModuleType("app.db.supabase")
_stub.get_supabase = lambda: None
sys.modules.setdefault("app.db.supabase", _stub)

import httpcore  # noqa: E402
import httpx  # noqa: E402
import pytest  # noqa: E402

from app.llm import ModelUnavailable  # noqa: E402
from app.models import OUTREACH_DRAFT_MODEL, OUTREACH_FOLLOWUP_MODEL, OUTREACH_RESEARCH_MODEL, OUTREACH_REWRITE_MODEL  # noqa: E402
from app.nodes.agents.outreach import draft, pages, prompts, research, voices  # noqa: E402

EM, EN = "\u2014", "\u2013"


def run(coro):
    return asyncio.run(coro)


class Events(list):
    """An emit callback that keeps what it was sent."""

    async def __call__(self, event):
        self.append(event)

    def lines(self):
        return [(e["id"], e["status"], e["label"]) for e in self]


def assert_labels_ok(events):
    for e in events:
        assert e["type"] == "progress"
        assert e["status"] in ("active", "done", "failed")
        assert 0 < len(e["label"]) < 70 and EM not in e["label"]


# ── Fake DNS and HTTP ────────────────────────────────────────────────────────

@pytest.fixture
def dns(monkeypatch):
    """host -> addresses. Unknown hosts do not resolve. Records the thread of
    every lookup, to prove it runs off the event loop."""
    world = NS(table={}, threads=[], asked=[])

    def fake(host, port):
        world.threads.append(threading.get_ident())
        world.asked.append(host)
        if host not in world.table:
            raise socket.gaierror("no such host")
        out = []
        for ip in world.table[host]:
            if ":" in ip:
                out.append((socket.AF_INET6, socket.SOCK_STREAM, 6, "", (ip, port, 0, 0)))
            else:
                out.append((socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, port)))
        return out

    monkeypatch.setattr(pages, "_getaddrinfo", fake)
    return world


@pytest.fixture
def web(monkeypatch):
    """url -> a function making the response. Records every URL requested."""
    world = NS(routes={}, seen=[])

    def handler(request):
        url = str(request.url)
        world.seen.append(url)
        make = world.routes.get(url)
        return make(request) if make else httpx.Response(404)

    monkeypatch.setattr(pages, "_client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler),
                                                                      follow_redirects=False))
    return world


class Chunks(httpx.AsyncByteStream):
    """A body that arrives in pieces, like a real response (content= would be
    read in full up front, which no real server does)."""

    def __init__(self, data: bytes, size: int = 65536):
        self.data, self.size = data, size

    async def __aiter__(self):
        for i in range(0, len(self.data), self.size):
            yield self.data[i:i + self.size]


def html(body, content_type="text/html; charset=utf-8", **headers):
    data = body.encode("utf-8") if isinstance(body, str) else body
    return lambda _req: httpx.Response(200, headers={"content-type": content_type, **headers}, stream=Chunks(data))


def redirect(location, code=302):
    return lambda _req: httpx.Response(code, headers={"location": location})


USF_IP = "131.247.1.1"
PROFILE = "https://www.usf.edu/marine-science/people/lee.html"


# ── Addresses ────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("ip", [
    "10.0.0.1", "172.16.0.1", "192.168.1.1", "127.0.0.1", "0.0.0.0", "169.254.169.254", "100.64.0.1",
    "100.100.100.200", "224.0.0.1", "255.255.255.255", "192.0.0.192", "168.63.129.16", "240.0.0.1",
    "::1", "::", "fe80::1", "fc00::1", "fd00:ec2::254", "fec0::1", "ff02::1",
    "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:169.254.169.254", "::7f00:1",
    "64:ff9b::a00:1", "2002:a00:1::", "2001::1", "fe80::1%eth0", "not an ip", "",
])
def test_non_public_addresses_are_refused(ip):
    assert not pages.is_public_address(ip)


@pytest.mark.parametrize("ip", ["8.8.8.8", USF_IP, "2607:f8b0:4004::1", "::ffff:8.8.8.8", "64:ff9b::808:808"])
def test_public_addresses_pass(ip):
    assert pages.is_public_address(ip)


@pytest.mark.parametrize("host", [
    "localhost", "api.localhost", "metadata.google.internal", "printer.local", "db.internal", "metadata",
    "127.1", "2130706433", "0x7f.1", "[::1]", "::1", "intranet", "", "a..b.edu",
])
def test_internal_and_numeric_host_names_are_refused(host):
    assert not pages.host_allowed(host)


def test_ordinary_host_names_pass():
    assert pages.host_allowed("www.usf.edu") and pages.host_allowed("xn--bcher-kva.de")


@pytest.mark.parametrize("url", [
    "http://www.usf.edu/lee",                       # not https
    "https://user:pw@www.usf.edu/lee",              # userinfo
    "https://www.usf.edu@10.0.0.1/",                # a host hidden behind userinfo
    "https://www.usf.edu\\@evil.example.com/",      # parser confusion
    "https://www.usf.edu:8443/lee",                 # not port 443
    "https://www.usf.edu/a b",                      # whitespace
    "https://169.254.169.254/latest/meta-data/",    # a bare address
    "https://localhost/admin",
    "javascript:alert(1)", "ftp://www.usf.edu/x", "", None, 42,
    "https://www.usf.edu/" + "x" * 2100,
])
def test_urls_that_may_never_be_fetched(url):
    assert pages.checked_url(url) is None


def test_a_plain_https_url_passes_the_first_check():
    assert pages.checked_url(" " + PROFILE) == (PROFILE, "www.usf.edu")
    assert pages.checked_url("https://www.usf.edu:443/x") == ("https://www.usf.edu:443/x", "www.usf.edu")


# ── Fetching: the SSRF rules ─────────────────────────────────────────────────

def test_a_public_page_is_fetched_parsed_and_its_emails_found(dns, web):
    dns.table["www.usf.edu"] = [USF_IP]
    web.routes[PROFILE] = html("<html><head><title>Maria Lee | USF</title><script>var x='spy@evil.com'</script>"
                               "</head><body><h1>Maria Lee</h1><p>Email: mlee [at] usf [dot] edu</p></body></html>")
    page = run(pages.fetch_page(PROFILE))
    assert page.title == "Maria Lee | USF" and page.final_url == PROFILE
    assert page.emails == {"mlee@usf.edu"}
    assert "Maria Lee" in page.text and "spy@evil.com" not in page.text
    assert pages.page_has_email(page, "MLee@USF.edu") and not pages.page_has_email(page, "lee@usf.edu")


def test_dns_is_resolved_off_the_event_loop(dns, web):
    dns.table["www.usf.edu"] = [USF_IP]
    web.routes[PROFILE] = html("<p>hi</p>")
    loop_thread = threading.get_ident()
    assert run(pages.fetch_page(PROFILE)) is not None
    assert dns.threads and all(t != loop_thread for t in dns.threads)


@pytest.mark.parametrize("addresses", [
    ["10.0.0.5"], ["127.0.0.1"], ["169.254.169.254"], ["::1"], ["::ffff:127.0.0.1"], ["fd00:ec2::254"],
    [USF_IP, "192.168.0.10"],                       # one bad address among good ones is enough to refuse
])
def test_a_host_that_resolves_anywhere_private_is_never_requested(dns, web, addresses):
    dns.table["evil.example.com"] = addresses
    web.routes["https://evil.example.com/x"] = html("<p>secret</p>")
    assert run(pages.fetch_page("https://evil.example.com/x")) is None
    assert web.seen == []


def test_metadata_host_names_are_refused_before_any_lookup(dns, web):
    dns.table["metadata.google.internal"] = [USF_IP]
    assert run(pages.fetch_page("https://metadata.google.internal/computeMetadata/v1/")) is None
    assert dns.asked == [] and web.seen == []


def test_a_host_that_does_not_resolve_is_none(dns, web):
    assert run(pages.fetch_page("https://nowhere.example.org/x")) is None
    assert web.seen == []


def test_a_redirect_to_a_private_address_is_refused(dns, web):
    dns.table["www.usf.edu"] = [USF_IP]
    dns.table["intranet.example.com"] = ["10.1.2.3"]
    web.routes["https://www.usf.edu/old"] = redirect("https://intranet.example.com/admin")
    web.routes["https://intranet.example.com/admin"] = html("<p>admin</p>")
    assert run(pages.fetch_page("https://www.usf.edu/old")) is None
    assert web.seen == ["https://www.usf.edu/old"]


@pytest.mark.parametrize("location", [
    "http://www.usf.edu/plain", "https://user@www.usf.edu/x", "https://169.254.169.254/latest/", "https://localhost/",
    "ftp://www.usf.edu/x",
])
def test_every_redirect_hop_is_checked_again(dns, web, location):
    dns.table["www.usf.edu"] = [USF_IP]
    web.routes["https://www.usf.edu/old"] = redirect(location)
    assert run(pages.fetch_page("https://www.usf.edu/old")) is None
    assert web.seen == ["https://www.usf.edu/old"]


def test_a_relative_redirect_between_public_pages_is_followed(dns, web):
    dns.table["www.usf.edu"] = [USF_IP]
    web.routes["https://www.usf.edu/old"] = redirect("/people/lee", 301)
    web.routes["https://www.usf.edu/people/lee"] = html("<p>Contact mlee@usf.edu</p>")
    page = run(pages.fetch_page("https://www.usf.edu/old"))
    assert page.url == "https://www.usf.edu/old" and page.final_url == "https://www.usf.edu/people/lee"
    assert page.emails == {"mlee@usf.edu"}


def test_at_most_three_redirects(dns, web):
    dns.table["www.usf.edu"] = [USF_IP]
    for i in range(4):
        web.routes[f"https://www.usf.edu/{i}"] = redirect(f"https://www.usf.edu/{i + 1}")
    web.routes["https://www.usf.edu/4"] = html("<p>end</p>")
    assert run(pages.fetch_page("https://www.usf.edu/0")) is None
    assert len(web.seen) == 4
    # Three hops is fine.
    web.seen.clear()
    assert run(pages.fetch_page("https://www.usf.edu/1")).final_url == "https://www.usf.edu/4"


@pytest.mark.parametrize("content_type", ["application/pdf", "image/png", "application/json", ""])
def test_only_html_and_plain_text_are_read(dns, web, content_type):
    dns.table["www.usf.edu"] = [USF_IP]
    web.routes[PROFILE] = lambda _r: httpx.Response(200, headers={"content-type": content_type} if content_type else {},
                                                    content=b"mlee@usf.edu")
    assert run(pages.fetch_page(PROFILE)) is None


def test_plain_text_pages_are_read_as_text(dns, web):
    dns.table["www.usf.edu"] = [USF_IP]
    web.routes["https://www.usf.edu/c.txt"] = html("Write to mlee <at> usf <dot> edu", "text/plain")
    page = run(pages.fetch_page("https://www.usf.edu/c.txt"))
    assert page.emails == {"mlee@usf.edu"}


def test_errors_and_failures_are_none_not_raised(dns, web):
    dns.table["www.usf.edu"] = [USF_IP]
    web.routes["https://www.usf.edu/404"] = lambda _r: httpx.Response(404)
    web.routes["https://www.usf.edu/500"] = lambda _r: httpx.Response(500, content=b"x")
    web.routes["https://www.usf.edu/slow"] = lambda _r: (_ for _ in ()).throw(httpx.ReadTimeout("slow"))
    web.routes["https://www.usf.edu/nolocation"] = lambda _r: httpx.Response(302)
    for path in ("404", "500", "slow", "nolocation"):
        assert run(pages.fetch_page(f"https://www.usf.edu/{path}")) is None


def test_reads_at_most_the_size_cap(dns, web):
    dns.table["www.usf.edu"] = [USF_IP]
    body = b"<html><body><p>early@usf.edu</p>" + b"x " * 1_000_000 + b"<p>late@usf.edu</p></body></html>"
    web.routes[PROFILE] = html(body)
    page = run(pages.fetch_page(PROFILE))
    assert len(page.text) <= pages.MAX_BYTES
    assert "early@usf.edu" in page.emails and "late@usf.edu" not in page.emails


def test_a_compressed_body_is_capped_after_decompressing_too(dns, web):
    dns.table["www.usf.edu"] = [USF_IP]
    bomb = gzip.compress(b"<html><body>" + b"a " * 5_000_000 + b"</body></html>")
    web.routes[PROFILE] = html(bomb, **{"content-encoding": "gzip"})
    page = run(pages.fetch_page(PROFILE))
    assert page is not None and len(page.text) <= pages.MAX_BYTES
    web.routes[PROFILE] = html(b"whatever", **{"content-encoding": "br"})
    assert run(pages.fetch_page(PROFILE)) is None


def test_the_declared_charset_is_used(dns, web):
    dns.table["www.usf.edu"] = [USF_IP]
    web.routes[PROFILE] = html("<p>María Lee</p>".encode("latin-1"), "text/html; charset=iso-8859-1")
    assert "María Lee" in run(pages.fetch_page(PROFILE)).text


class FakeInner(httpcore.AsyncNetworkBackend):
    def __init__(self, fail=()):
        self.calls, self.fail = [], set(fail)

    async def connect_tcp(self, host, port, timeout=None, local_address=None, socket_options=None):
        self.calls.append((host, port))
        if host in self.fail:
            raise httpcore.ConnectError("refused")
        return f"stream to {host}"

    async def sleep(self, seconds):
        return None


def test_the_socket_goes_only_to_the_address_that_was_checked(dns):
    # DNS rebinding: the name passed the first check, then points somewhere private.
    dns.table["rebind.example.com"] = ["10.0.0.9"]
    inner = FakeInner()
    backend = pages._PublicOnlyBackend(inner)
    with pytest.raises(httpcore.ConnectError):
        run(backend.connect_tcp("rebind.example.com", 443))
    assert inner.calls == []

    dns.table["www.usf.edu"] = ["131.247.9.9", USF_IP]
    inner = FakeInner(fail={"131.247.9.9"})
    assert run(pages._PublicOnlyBackend(inner).connect_tcp("www.usf.edu", 443)) == f"stream to {USF_IP}"
    assert inner.calls == [("131.247.9.9", 443), (USF_IP, 443)]
    with pytest.raises(httpcore.ConnectError):
        run(pages._PublicOnlyBackend(inner).connect_unix_socket("/var/run/docker.sock"))


def test_the_real_client_refuses_a_private_answer_when_connecting(dns):
    # Skips fetch_page's own check, as a DNS answer that changed after it would:
    # the pinned backend still refuses before any socket opens.
    dns.table["www.usf.edu"] = ["10.0.0.1"]

    async def go():
        async with pages._client() as client:
            with pytest.raises(httpx.ConnectError):
                await client.get("https://www.usf.edu/lee")
    run(go())
    assert dns.asked == ["www.usf.edu"]


def test_the_real_client_is_pinned_and_follows_nothing_on_its_own():
    client = pages._client()
    try:
        assert isinstance(client._transport._pool._network_backend, pages._PublicOnlyBackend)
        assert client.follow_redirects is False
    finally:
        run(client.aclose())


def test_a_lookup_that_never_answers_times_out_on_its_own_pool(monkeypatch):
    # A name server that never answers pins a lookup thread until the system
    # resolver gives up. Those threads are the outreach pool's, never the
    # shared default pool that Quest, chat and budgets run on.
    release, names = threading.Event(), []

    def hang(host, port):
        names.append(threading.current_thread().name)
        release.wait(10)
        raise socket.gaierror("gave up")

    monkeypatch.setattr(pages, "_getaddrinfo", hang)
    monkeypatch.setattr(pages, "DNS_TIMEOUT_SECONDS", 0.2)

    async def go():
        start = time.perf_counter()
        lookups = [pages.public_addresses(f"slow{i}.example.com") for i in range(pages._DNS_POOL._max_workers + 4)]
        answers = await asyncio.gather(*lookups)
        took = time.perf_counter() - start
        start = time.perf_counter()
        assert await asyncio.to_thread(lambda: 42) == 42
        return answers, took, time.perf_counter() - start

    try:
        answers, took, other = run(go())
    finally:
        release.set()
    assert answers == [[]] * len(answers) and took < 2.0 and other < 0.5
    assert names and all(name.startswith("outreach-dns") for name in names)


def with_heartbeat(make):
    """Run make() beside a task that ticks every 5 ms: (its result, seconds it
    took, the longest the event loop went without running the ticker)."""
    async def go():
        longest, stop = [0.0], asyncio.Event()

        async def tick():
            last = time.perf_counter()
            while not stop.is_set():
                await asyncio.sleep(0.005)
                now = time.perf_counter()
                longest[0], last = max(longest[0], now - last), now

        ticker = asyncio.create_task(tick())
        await asyncio.sleep(0.02)                   # the ticker is running before the work starts
        start = time.perf_counter()
        result = await make()
        took = time.perf_counter() - start
        stop.set()
        await ticker
        return result, took, longest[0]
    return run(go())


@pytest.mark.parametrize("body,content_type,headers", [
    # Unclosed tags: quadratic in html.parser, hours at this size.
    (b"<html><body><p>Hello</p>" + b"<a " * 500_000, "text/html", {}),
    # 1.5 MB of spaces in 1.5 KB of gzip: quadratic under a regex opening with \s*.
    (gzip.compress(b" " * 1_500_000), "text/plain", {"content-encoding": "gzip"}),
    # A charset whose decoder is quadratic: read as UTF-8 instead.
    (b"-" + b"a" * 1_499_999, "text/html; charset=punycode", {}),
])
def test_a_hostile_page_never_stalls_the_event_loop(dns, web, monkeypatch, body, content_type, headers):
    dns.table["www.usf.edu"] = [USF_IP]
    web.routes[PROFILE] = html(body, content_type, **headers)
    threads, real = [], pages._read_body

    def spy(*args):
        threads.append(threading.current_thread().name)
        return real(*args)

    monkeypatch.setattr(pages, "_read_body", spy)
    page, took, stall = with_heartbeat(lambda: pages.fetch_page(PROFILE))
    assert page is not None and took < 3.0 and stall < 0.5, (took, stall)
    assert threads and threads[0].startswith("outreach-parse")
    assert len(page.text) <= pages.MAX_PARSE_CHARS


# Bodies at the full read cap, each aimed at a way a parser or a regex can go
# quadratic or worse. All of them were read in well under a second when this
# was written; the limit leaves room for a slow machine.
HOSTILE = {
    "tags that never close": lambda: "<a " * 500_000,
    "a long run of spaces": lambda: " " * 1_500_000,
    "quotes that never pair": lambda: "<'>'" * 375_000,
    "values that close late": lambda: '<a x="a> ' * 166_000,
    "a value that never closes": lambda: '<a x="' + "y" * 1_500_000,
    "a comment that never closes": lambda: "<!--" + "a" * 1_500_000,
    "end tags that never close": lambda: "</" * 750_000,
    "a script that never ends": lambda: "<script>" + "<" * 1_500_000,
    "a huge character reference": lambda: "&#" + "9" * 1_500_000,
    "many named references": lambda: "&abcdefghijklmnopqrstuvwxyzabcdef" * 45_000,
    "a domain that never ends": lambda: "x@" + "a." * 750_000,
    "at signs everywhere": lambda: "a@" * 750_000,
    "bracketed at signs": lambda: " [ at ] " * 190_000,
    "one tag, many attributes": lambda: "<a " + "x= " * 500_000 + ">",
    "text full of less-than signs": lambda: "a < b " * 250_000,
    "nested skipped tags": lambda: "<svg>" * 300_000,
}


@pytest.mark.parametrize("name", sorted(HOSTILE))
def test_hostile_markup_is_read_in_bounded_time(name):
    body = HOSTILE[name]()
    assert len(body) >= 1_400_000
    start = time.perf_counter()
    pages._parse_html(body)
    pages._emails_in_text(body)
    assert time.perf_counter() - start < 2.0, name


def test_only_the_start_of_a_page_is_read():
    body = "<p>early@usf.edu</p>" + "x" * pages.MAX_PARSE_CHARS + "<p>late@usf.edu</p>"
    assert pages.extract_emails(body) == {"early@usf.edu"}
    assert pages._emails_in_text("early@usf.edu " + " " * pages.MAX_PARSE_CHARS + "late@usf.edu") == {"early@usf.edu"}


# ── Finding addresses on a page ──────────────────────────────────────────────

def _cf(address, key=0x42):
    return f"{key:02x}" + "".join(f"{ord(c) ^ key:02x}" for c in address)


@pytest.mark.parametrize("markup,expected", [
    ("<p>Email: mlee@usf.edu.</p>", {"mlee@usf.edu"}),
    ('<a href="mailto:Maria.Lee@USF.edu?subject=Hello">email me</a>', {"maria.lee@usf.edu"}),
    ('<a href="mailto:m%2Elee%40usf.edu">x</a>', {"m.lee@usf.edu"}),
    ("<p>mlee [at] usf [dot] edu</p>", {"mlee@usf.edu"}),
    ("<p>mlee(at)usf(dot)edu</p>", {"mlee@usf.edu"}),
    ("<p>mlee {AT} usf.edu</p>", {"mlee@usf.edu"}),
    ("<p>mlee &lt;at&gt; usf &lt;dot&gt; edu</p>", {"mlee@usf.edu"}),
    ("<p>mlee<span>@</span>usf.edu</p>", {"mlee@usf.edu"}),
    ("<p>&#109;&#108;&#101;&#101;&#64;usf.edu</p>", {"mlee@usf.edu"}),
    (f'<span class="__cf_email__" data-cfemail="{_cf("mlee@usf.edu")}">[email protected]</span>', {"mlee@usf.edu"}),
    (f'<a href="/cdn-cgi/l/email-protection#{_cf("mlee@usf.edu", 0x17)}">x</a>', {"mlee@usf.edu"}),
    # A bare " at " is English, not an address.
    ("<p>Reach me at the lab dot com, or mlee at usf dot edu</p>", set()),
    ('<img src="logo@2x.png"><p>icon@2x.png</p>', set()),
    ("<script>var e = 'hidden@usf.edu';</script><style>.a{}</style>", set()),
])

def test_emails_are_found_in_every_common_spelling(markup, expected):
    assert pages.extract_emails(markup) == expected


@pytest.mark.parametrize("markup,expected", [
    ('<a title="a > b" href="mailto:mlee@usf.edu">x</a>', {"mlee@usf.edu"}),
    ('<A HREF="MAILTO:MLee@USF.edu">x</A>', {"mlee@usf.edu"}),
    ('<a href="mailto:mlee&#64;usf.edu">x</a>', {"mlee@usf.edu"}),
    ('<SCRIPT>document.write("<p>spy@evil.com</p>")</SCRIPT><p>mlee@usf.edu</p>', {"mlee@usf.edu"}),
    ("<!-- old: spy@evil.com --><p>mlee@usf.edu</p>", {"mlee@usf.edu"}),
    ("<p>mlee@usf.edu</p><!-- never closed, spy@evil.com", {"mlee@usf.edu"}),
    ("<p>if a < b, write mlee@usf.edu</p>", {"mlee@usf.edu"}),
    ("<img alt=Don't src=x.png><p>mlee@usf.edu</p>", {"mlee@usf.edu"}),
    ("<p>mlee    [   at   ]   usf   [ dot ]   edu</p>", {"mlee@usf.edu"}),
    ("<!DOCTYPE html><?xml version='1.0'?><br/><p>mlee@usf.edu</p>", {"mlee@usf.edu"}),
])
def test_the_scanner_reads_markup_as_pages_really_write_it(markup, expected):
    assert pages.extract_emails(markup) == expected


def test_the_page_title_is_the_documents_not_an_icons():
    title, text, _ = pages._parse_html("<svg><title>Search icon</title></svg><title>Lee Lab</title><p>Hi</p>")
    assert title == "Lee Lab" and "Search icon" not in text


def test_domains_and_sites():
    assert pages.domain_of("https://www.usf.edu/x") == "usf.edu"
    assert pages.domain_of("Maria.Lee@Mail.USF.edu") == "mail.usf.edu"
    assert pages.domain_of("") == "" and pages.domain_of(None) == ""
    assert pages.site_of("https://biology.usf.edu/x") == pages.site_of("m@mail.usf.edu") == "usf.edu"
    assert pages.site_of("a@cam.ac.uk") == "cam.ac.uk"


# ── Research: the shortlist ──────────────────────────────────────────────────

NOAA = "https://www.noaa.gov/people/ortiz"
CONTACT = "https://www.usf.edu/marine-science/contact.html"
DIRECTORY = "https://www.usf.edu/marine-science/directory.html"


def scripted_search(monkeypatch, submission, returned, stats=None, events=(), raises=None):
    calls = []

    async def fake(**kwargs):
        calls.append(kwargs)
        if raises:
            raise raises
        for event in events:
            await kwargs["on_event"](event)
        return submission, set(returned), stats or {"searches": 1, "errors": 0}

    monkeypatch.setattr(research, "search_completion", fake)
    return calls


def page_at(url, markup, title="A page", final=None):
    t, text, emails = pages._parse_html(markup)
    return pages.Page(url=url, final_url=final or url, title=title, text=text, emails=emails)


@pytest.fixture
def site(monkeypatch):
    """url -> Page for pages.fetch_page. Records every URL fetched."""
    world = NS(pages={}, fetched=[])

    async def fake(url):
        world.fetched.append(url)
        return world.pages.get(url)

    monkeypatch.setattr(pages, "fetch_page", fake)
    return world


def person(name, url, why="Runs a coral lab near you.", **extra):
    return {"name": name, "title": "Professor", "organization": "USF", "why": why, "source_url": url,
            "source_title": "", **extra}


def test_the_shortlist_keeps_only_real_safe_links_and_one_entry_per_person(monkeypatch):
    returned = {PROFILE, NOAA, "http://plain.example.edu/x", "https://old.reddit.com/r/x",
                "https://rocketreach.co/maria-lee"}
    people = [
        person("Invented Person", "https://made-up.example.edu/p"),
        person("Plain Person", "http://plain.example.edu/x"),
        person("Reddit Person", "https://old.reddit.com/r/x"),
        person("Broker Person", "https://rocketreach.co/maria-lee"),
        person("Dr. Maria Lee", PROFILE),
        person("Maria Lee", NOAA),                                   # the same person again
        person("Ben Ortiz", NOAA, why=f"Leads reef surveys {EM} close to Tampa."),
        person("", PROFILE),
    ]
    scripted_search(monkeypatch, {"people": people}, returned)
    out = run(research.find_people("I want to study coral reefs", record_text="", emit=Events()))
    assert [p["name"] for p in out] == ["Dr. Maria Lee", "Ben Ortiz"]
    assert out[1]["why"] == "Leads reef surveys, close to Tampa."
    assert out[0]["source_title"] == "usf.edu"
    assert set(out[0]) == {"name", "title", "organization", "why", "source_url", "source_title"}


def test_the_shortlist_is_capped_at_five(monkeypatch):
    urls = [f"https://www.usf.edu/p{i}" for i in range(8)]
    names = ["Ana Diaz", "Ben Ortiz", "Cara Wu", "Dev Rao", "Eli Stone", "Fay Moss", "Gus Hale", "Hana Kim"]
    scripted_search(monkeypatch, {"people": [person(n, u) for n, u in zip(names, urls)]}, set(urls))
    assert len(run(research.find_people("coral reefs", record_text="", emit=Events()))) == 5


def test_the_shortlist_streams_true_progress(monkeypatch):
    events = [
        {"type": "search", "query": "coral reef lab Tampa outreach high school"},
        {"type": "results", "count": 8, "domains": ["usf.edu", "noaa.gov"]},
        {"type": "search", "query": "marine science graduate students USF"},
        {"type": "search_error"},
    ]
    scripted_search(monkeypatch, {"people": [person("Maria Lee", PROFILE)]}, {PROFILE},
                    stats={"searches": 2, "errors": 1}, events=events)
    emitted = Events()
    run(research.find_people("coral reefs", record_text="", emit=emitted))
    assert emitted.lines() == [
        ("search-1", "active", "Searching the web"),
        ("search-1", "active", "Searching: coral reef lab Tampa outreach high school"),
        ("search-1", "done", "Found 8 pages on usf.edu, noaa.gov"),
        ("search-2", "active", "Searching: marine science graduate students USF"),
        ("search-2", "failed", "That search did not go through"),
        ("pick", "done", "Picked 1 person for you to choose from"),
    ]
    assert_labels_ok(emitted)


def test_a_search_that_failed_is_none_and_an_honest_empty_one_is_empty(monkeypatch):
    goal = "coral reefs"
    scripted_search(monkeypatch, None, set(), raises=ModelUnavailable("down"))
    assert run(research.find_people(goal, record_text="", emit=Events())) is None
    scripted_search(monkeypatch, {"people": []}, set(), stats={"searches": 1, "errors": 1})
    assert run(research.find_people(goal, record_text="", emit=Events())) is None
    scripted_search(monkeypatch, {"people": []}, set(), stats={"searches": 0, "errors": 0})
    emitted = Events()
    assert run(research.find_people(goal, record_text="", emit=emitted)) is None
    assert ("search-1", "failed", "No search ran") in emitted.lines()
    scripted_search(monkeypatch, None, {PROFILE})                              # searched, never submitted
    assert run(research.find_people(goal, record_text="", emit=Events())) is None
    scripted_search(monkeypatch, {"people": "nobody"}, {PROFILE})
    assert run(research.find_people(goal, record_text="", emit=Events())) is None
    scripted_search(monkeypatch, {"people": []}, set(), stats={"searches": 2, "errors": 0})
    assert run(research.find_people(goal, record_text="", emit=Events())) == []


def test_the_research_record_drops_the_name_everywhere():
    record = ("Name: Samira Quintero\nYear: currently grade 11\n"
              "Who they are: Samira is a junior; Quintero's club tests water.")
    text = research.research_record(record)
    assert "Samira" not in text and "Quintero" not in text
    assert "Year: currently grade 11" in text and "the student is a junior" in text


def test_the_research_record_takes_out_the_name_not_the_words_in_it():
    record = ("Name: Emily Park\nActivities: National Park Service volunteer\n"
              "Who they are: Park led the Art Club at Central Park; Emily Park won; emily park again.")
    text = research.research_record(record)
    assert "National Park Service volunteer" in text and "at Central Park;" in text
    assert "the student led the Art Club" in text and "Emily" not in text and "emily" not in text
    record = "Name: Will Grace\nWho they are: Will leads and will present at the Grace Hopper Celebration."
    assert research.research_record(record) == ("Who they are: the student leads and will present at the "
                                                 "Grace Hopper Celebration.")
    record = "Name: hope lee\nWho they are: Hope hopes to lead; Lee's club. hope lee"
    assert research.research_record(record) == "Who they are: the student hopes to lead; the student's club. the student"


def test_the_shortlist_leaves_out_school_students(monkeypatch):
    urls = [f"https://www.usf.edu/p{i}" for i in range(5)]
    people = [person("Sam Young", urls[0], title="High school junior"),
              person("Ava Cruz", urls[1], title="Student", organization="Hillsborough High School"),
              person("Leo Park", urls[2], title="10th grader"),
              person("Ana Diaz", urls[3], title="Biology teacher", organization="Hillsborough High School"),
              person("Ben Ortiz", urls[4], title="Graduate student")]
    scripted_search(monkeypatch, {"people": people}, set(urls))
    out = run(research.find_people("coral reefs", record_text="", emit=Events()))
    assert [p["name"] for p in out] == ["Ana Diaz", "Ben Ortiz"]


def test_the_search_never_sees_the_students_name(monkeypatch):
    calls = scripted_search(monkeypatch, {"people": []}, set(), stats={"searches": 1, "errors": 0})
    record = "Name: Samira Quintero\nYear: currently grade 11\nActivities: Marine Science Club"
    run(research.find_people("coral reefs", record_text=record, emit=Events()))
    call = calls[0]
    assert "Samira" not in call["prompt"] and "Marine Science Club" in call["prompt"]
    assert call["model"] == OUTREACH_RESEARCH_MODEL and call["max_searches"] == 2
    assert "reddit.com" in call["blocked_domains"] and "rocketreach.co" in call["blocked_domains"]
    assert call["submit_tool"]["name"] == "submit_people"


# ── Research: one person, and the email check ────────────────────────────────

GOOD_FACT = {"text": "The Lee Lab builds low-cost sensors to track coral bleaching.", "url": PROFILE,
             "source_title": "Maria Lee | USF"}


def found(email=None, facts=None, name="Maria Lee", profile=PROFILE):
    return {
        "status": "found",
        "recipient_kind": "professional",
        "person": {"name": name, "title": "Associate Professor", "organization": "University of South Florida",
                   "profile_url": profile, "profile_title": "Maria Lee | USF"},
        "facts": [GOOD_FACT] if facts is None else facts,
        "email": email or {"address": "", "url": ""},
        "candidates": [],
    }


TARGET = {"name": "Dr. Maria Lee", "organization": "University of South Florida", "url": ""}


def test_found_with_an_email_verified_on_the_page_the_model_cited(monkeypatch, site):
    facts = [GOOD_FACT,
             {"text": "She won a made-up prize.", "url": "https://made-up.example.org/x", "source_title": ""},
             {"text": "Insecure page fact.", "url": "http://www.usf.edu/x", "source_title": ""},
             {"text": GOOD_FACT["text"], "url": PROFILE, "source_title": ""}]            # a repeat
    scripted_search(monkeypatch, found({"address": "mlee@usf.edu", "url": CONTACT}, facts), {PROFILE, CONTACT})
    site.pages[CONTACT] = page_at(CONTACT, "<p>Maria Lee, mlee [at] usf [dot] edu</p>", title="Contact us")
    emitted = Events()
    out = run(research.research_person(TARGET, emit=emitted))
    assert out["status"] == "found"
    assert out["facts"] == [{"text": GOOD_FACT["text"], "url": PROFILE}]
    assert out["verified_email"] == "mlee@usf.edu" and out["email_source_url"] == CONTACT
    assert out["email_source_kind"] == "search"
    assert out["person"]["profile_url"] == PROFILE and out["person"]["name"] == "Maria Lee"
    assert out["sources"] == [
        {"url": PROFILE, "title": "Maria Lee | USF", "domain": "usf.edu"},
        {"url": CONTACT, "title": "Contact us", "domain": "usf.edu"},
    ]
    assert ("email", "done", "Email confirmed on usf.edu") in emitted.lines()
    assert_labels_ok(emitted)


def test_an_address_missing_from_the_cited_page_falls_back_to_the_profile(monkeypatch, site):
    scripted_search(monkeypatch, found({"address": "m.lee@usf.edu", "url": CONTACT}), {PROFILE, CONTACT})
    site.pages[CONTACT] = page_at(CONTACT, "<p>Front office: marine@usf.edu</p>")
    site.pages[PROFILE] = page_at(PROFILE, '<a href="mailto:maria.lee@usf.edu">Email</a> <p>office@usf.edu</p>')
    out = run(research.research_person(TARGET, emit=Events()))
    assert out["verified_email"] == "maria.lee@usf.edu" and out["email_source_url"] == PROFILE


def test_a_guessed_address_is_never_kept(monkeypatch, site):
    scripted_search(monkeypatch, found({"address": "mlee@usf.edu", "url": CONTACT}), {PROFILE, CONTACT})
    site.pages[CONTACT] = page_at(CONTACT, "<p>Department of Marine Science</p>")
    site.pages[PROFILE] = page_at(PROFILE, "<p>Maria Lee studies coral.</p>")
    emitted = Events()
    out = run(research.research_person(TARGET, emit=emitted))
    assert out["status"] == "found" and out["verified_email"] is None and out["email_source_url"] is None
    assert ("email", "done", "No public email found, you can add one") in emitted.lines()


def test_an_address_at_another_domain_is_not_taken_from_the_profile(monkeypatch, site):
    scripted_search(monkeypatch, found(), {PROFILE})
    site.pages[PROFILE] = page_at(PROFILE, "<p>maria.lee@gmail.com</p>")
    assert run(research.research_person(TARGET, emit=Events()))["verified_email"] is None


def test_a_page_the_search_never_returned_is_never_fetched(monkeypatch, site):
    scripted_search(monkeypatch, found({"address": "mlee@usf.edu", "url": "https://made-up.usf.edu/c"}), {PROFILE})
    site.pages[PROFILE] = page_at(PROFILE, "<p>No address here</p>")
    out = run(research.research_person(TARGET, emit=Events()))
    assert out["verified_email"] is None
    assert "https://made-up.usf.edu/c" not in site.fetched


def test_someone_elses_address_on_a_directory_page_is_rejected(monkeypatch, site):
    scripted_search(monkeypatch, found({"address": "jsmith@usf.edu", "url": DIRECTORY}), {PROFILE, DIRECTORY})
    site.pages[DIRECTORY] = page_at(DIRECTORY, "<p>Maria Lee, Jo Smith: jsmith@usf.edu, ab@usf.edu, cd@usf.edu</p>")
    site.pages[PROFILE] = page_at(PROFILE, "<p>Maria Lee</p>")
    assert run(research.research_person(TARGET, emit=Events()))["verified_email"] is None


def test_an_id_style_address_is_kept_when_it_is_the_only_one_on_a_page_naming_them(monkeypatch, site):
    scripted_search(monkeypatch, found({"address": "ml4021@usf.edu", "url": CONTACT}), {PROFILE, CONTACT})
    site.pages[CONTACT] = page_at(CONTACT, "<h1>Maria Lee</h1><p>ml4021@usf.edu</p>")
    assert run(research.research_person(TARGET, emit=Events()))["verified_email"] == "ml4021@usf.edu"


@pytest.mark.parametrize("address", ["mlee@usf.edu", "maria.lee@usf.edu", "leem@usf.edu", "m.lee@usf.edu",
                                     "lee@usf.edu", "marialee@usf.edu", "mlee3@usf.edu", "maria_lee@usf.edu"])
def test_addresses_built_from_the_name(address):
    assert research.name_matches_address("Dr. Maria J. Lee", address)


@pytest.mark.parametrize("address", ["office@usf.edu", "leeann.smith@usf.edu", "lee.lab@usf.edu", "mlee",
                                     "jsmith@usf.edu", "mariel@usf.edu", ""])
def test_addresses_not_built_from_the_name(address):
    assert not research.name_matches_address("Maria Lee", address)


def test_accents_and_hyphens_in_names():
    assert research.name_tokens("Dr. María J. Núñez-Ortiz, PhD") == ["maria", "nunezortiz"]
    assert research.name_matches_address("María Núñez-Ortiz", "nunez-ortiz@usf.edu")
    assert research.same_person("Maria Lee", "Dr. Maria J. Lee") and research.same_person("Dr. Lee", "Maria Lee")
    assert not research.same_person("Bob Smith", "Robert Smith") and not research.same_person("Maria Lee", "Mark Leeds")


def test_no_fact_that_checks_out_means_not_found(monkeypatch, site):
    bad = [{"text": "Invented.", "url": "https://made-up.example.org/x", "source_title": ""}]
    scripted_search(monkeypatch, found(facts=bad), {PROFILE})
    assert run(research.research_person(TARGET, emit=Events())) == {"status": "not_found"}


def test_ambiguous_names_list_up_to_three_checked_candidates(monkeypatch, site):
    urls = [f"https://www.usf.edu/p{i}" for i in range(5)]
    cands = [person(n, u) for n, u in zip(["Maria Lee", "Maria A. Lee", "Maria Leeds", "Mary Lee", "M. Li"], urls)]
    cands.insert(0, person("Fake Lee", "https://made-up.example.org/p"))
    raw = {"status": "ambiguous", "person": {}, "facts": [], "email": {}, "candidates": cands}
    scripted_search(monkeypatch, raw, set(urls))
    out = run(research.research_person({"name": "Maria Lee"}, emit=Events()))
    assert out["status"] == "ambiguous"
    # "Maria A. Lee" is the same name as "Maria Lee" once the initial goes: one entry.
    assert [c["name"] for c in out["candidates"]] == ["Maria Lee", "Maria Leeds", "Mary Lee"]


def test_a_different_person_than_asked_for_is_offered_not_assumed(monkeypatch, site):
    scripted_search(monkeypatch, found(name="Mark Leeds"), {PROFILE})
    out = run(research.research_person(TARGET, emit=Events()))
    assert out["status"] == "ambiguous" and len(out["candidates"]) == 1
    assert out["candidates"][0]["name"] == "Mark Leeds" and out["candidates"][0]["source_url"] == PROFILE
    assert site.fetched == []                                                  # no email check for the wrong person


def test_not_found_and_failures(monkeypatch, site):
    none = {"status": "not_found", "person": {}, "facts": [], "email": {}, "candidates": []}
    scripted_search(monkeypatch, none, {PROFILE})
    assert run(research.research_person(TARGET, emit=Events())) == {"status": "not_found"}
    # A search that errored is a failure, never "not found".
    scripted_search(monkeypatch, none, set(), stats={"searches": 1, "errors": 1})
    assert run(research.research_person(TARGET, emit=Events())) is None
    scripted_search(monkeypatch, None, set(), raises=ModelUnavailable("down"))
    assert run(research.research_person(TARGET, emit=Events())) is None
    scripted_search(monkeypatch, None, {PROFILE})
    assert run(research.research_person(TARGET, emit=Events())) is None


def test_the_page_the_student_gave_is_read_and_may_be_cited(monkeypatch, site):
    given = "https://www.usf.edu/lee-lab"
    site.pages[given] = page_at(given, "<h1>Lee Lab</h1><p>We track coral bleaching with sensors.</p>",
                                title="Lee Lab")
    fact = {"text": "The lab tracks coral bleaching with sensors.", "url": given, "source_title": ""}
    calls = scripted_search(monkeypatch, found(facts=[fact], profile=""), set(),
                            stats={"searches": 1, "errors": 1},
                            events=[{"type": "search", "query": "Maria Lee USF"}, {"type": "search_error"}])
    emitted = Events()
    out = run(research.research_person({**TARGET, "url": given}, emit=emitted))
    assert out["status"] == "found" and out["facts"] == [{"text": fact["text"], "url": given}]
    assert "We track coral bleaching with sensors." in calls[0]["prompt"]
    lines = emitted.lines()
    assert lines[:2] == [("search-1", "active", "Reading their page on usf.edu"),
                         ("search-1", "done", "Read Lee Lab")]
    assert ("search-2", "failed", "That search did not go through") in lines
    assert_labels_ok(emitted)


def test_a_blocked_page_the_student_gave_is_not_read(monkeypatch, site):
    scripted_search(monkeypatch, found(), {PROFILE})
    run(research.research_person({**TARGET, "url": "https://www.reddit.com/r/marinebio"}, emit=Events()))
    assert "https://www.reddit.com/r/marinebio" not in site.fetched


# ── Research: whose page an address is on ────────────────────────────────────

ROSTER = "https://www.riverbendclub.org/roster"
CLUB = "https://www.usf.edu/clubs/running/roster.html"
GIVEN = "https://www.leelab.org/people"


@pytest.mark.parametrize("url,markup,address", [
    # Another site's page: a club roster listing a Maria Lee's personal address.
    (ROSTER, "<p>Maria Lee, maria.lee@gmail.com</p>", "maria.lee@gmail.com"),
    (ROSTER, "<p>Maria Lee, mlee@riverbendclub.org</p>", "mlee@riverbendclub.org"),
    # Her university's site, but not her page: only an address at the university counts there.
    (CLUB, "<p>Maria Lee, maria.lee@gmail.com</p>", "maria.lee@gmail.com"),
    (CLUB, "<p>Maria Lee, maria.lee@noaa.gov</p>", "maria.lee@noaa.gov"),
])
def test_an_address_on_a_page_that_is_not_theirs_is_never_verified(monkeypatch, site, url, markup, address):
    scripted_search(monkeypatch, found({"address": address, "url": url}), {PROFILE, url})
    site.pages[url] = page_at(url, markup)
    site.pages[PROFILE] = page_at(PROFILE, "<p>Maria Lee studies coral.</p>")
    out = run(research.research_person(TARGET, emit=Events()))
    assert out["verified_email"] is None and out["email_source_url"] is None and out["email_source_kind"] is None
    assert url not in [s["url"] for s in out["sources"]]


def test_an_address_on_their_own_profile_is_theirs_at_any_domain(monkeypatch, site):
    scripted_search(monkeypatch, found({"address": "maria.lee@gmail.com", "url": PROFILE}), {PROFILE})
    site.pages[PROFILE] = page_at(PROFILE, "<h1>Maria Lee</h1><p>maria.lee@gmail.com</p>")
    out = run(research.research_person(TARGET, emit=Events()))
    assert out["verified_email"] == "maria.lee@gmail.com" and out["email_source_url"] == PROFILE
    assert out["email_source_kind"] == "search"


def test_without_a_profile_the_search_found_no_other_page_can_vouch(monkeypatch, site):
    scripted_search(monkeypatch, found({"address": "mlee@usf.edu", "url": CONTACT}, profile=""), {PROFILE, CONTACT})
    site.pages[CONTACT] = page_at(CONTACT, "<p>Maria Lee, mlee@usf.edu</p>")
    assert run(research.research_person(TARGET, emit=Events()))["verified_email"] is None


@pytest.mark.parametrize("final", ["https://rocketreach.co/maria-lee", "https://www.example.org/staff/lee"])
def test_a_page_that_redirected_to_another_site_verifies_nothing(monkeypatch, site, final):
    scripted_search(monkeypatch, found({"address": "mlee@usf.edu", "url": CONTACT}), {PROFILE, CONTACT})
    site.pages[CONTACT] = page_at(CONTACT, "<p>Maria Lee, mlee@usf.edu</p>", final=final)
    site.pages[PROFILE] = page_at(PROFILE, "<p>Maria Lee, mlee@usf.edu</p>", final=final)
    out = run(research.research_person(TARGET, emit=Events()))
    assert out["verified_email"] is None
    assert final not in [s["url"] for s in out["sources"]]


def test_a_redirect_within_the_site_is_fine_and_the_link_kept_is_the_one_returned(monkeypatch, site):
    scripted_search(monkeypatch, found({"address": "mlee@usf.edu", "url": CONTACT}), {PROFILE, CONTACT})
    site.pages[CONTACT] = page_at(CONTACT, "<p>Maria Lee, mlee@usf.edu</p>", final="https://marine.usf.edu/contact-us")
    out = run(research.research_person(TARGET, emit=Events()))
    assert out["verified_email"] == "mlee@usf.edu" and out["email_source_url"] == CONTACT


@pytest.mark.parametrize("address", ["webmaster@usf.edu", "info@usf.edu", "admissions@usf.edu", "office@usf.edu",
                                     "dept@usf.edu", "biology.dept@usf.edu", "gradadmissions@usf.edu",
                                     "no-reply@usf.edu", "lee.lab@usf.edu", "marineoffice@usf.edu", "hr@usf.edu"])
def test_office_mailboxes(address):
    assert research.is_role_address(address)


@pytest.mark.parametrize("address", ["mlee@usf.edu", "maria.lee@usf.edu", "ml4021@usf.edu", "labonte@usf.edu",
                                     "infante@usf.edu", "andrews@usf.edu", "", None])
def test_personal_mailboxes(address):
    assert not research.is_role_address(address)


def test_an_office_mailbox_is_never_shown_as_theirs(monkeypatch, site):
    # The only address on a page that names her in full is the site's own.
    scripted_search(monkeypatch, found({"address": "webmaster@usf.edu", "url": CONTACT}), {PROFILE, CONTACT})
    site.pages[CONTACT] = page_at(CONTACT, "<h1>Dr. Maria Lee</h1><footer>webmaster@usf.edu</footer>")
    site.pages[PROFILE] = page_at(PROFILE, "<p>Maria Lee</p><p>info@usf.edu</p>")
    assert run(research.research_person(TARGET, emit=Events()))["verified_email"] is None


@pytest.mark.parametrize("returned", [{PROFILE}, {PROFILE, GIVEN}])
def test_an_address_on_the_page_the_student_gave_says_so(monkeypatch, site, returned):
    site.pages[GIVEN] = page_at(GIVEN, "<h1>Maria Lee</h1><p>maria.lee@gmail.com</p>", title="Lee Lab")
    site.pages[PROFILE] = page_at(PROFILE, "<p>Maria Lee studies coral.</p>")
    scripted_search(monkeypatch, found({"address": "maria.lee@gmail.com", "url": GIVEN}), returned)
    out = run(research.research_person({**TARGET, "url": GIVEN}, emit=Events()))
    assert out["verified_email"] == "maria.lee@gmail.com" and out["email_source_url"] == GIVEN
    assert out["email_source_kind"] == "given_url"                  # even when the search returned it too


def test_a_shortlist_picks_page_came_from_a_search(monkeypatch, site):
    site.pages[GIVEN] = page_at(GIVEN, "<h1>Maria Lee</h1><p>maria.lee@gmail.com</p>", title="Lee Lab")
    fact = {"text": "The Lee Lab tracks coral bleaching.", "url": GIVEN, "source_title": ""}
    raw = found({"address": "maria.lee@gmail.com", "url": GIVEN}, facts=[fact], profile=GIVEN)
    scripted_search(monkeypatch, raw, {PROFILE})
    out = run(research.research_person({**TARGET, "url": GIVEN, "url_source": "search"}, emit=Events()))
    assert out["verified_email"] == "maria.lee@gmail.com" and out["email_source_kind"] == "search"
    # The same page typed by the student.
    out = run(research.research_person({**TARGET, "url": GIVEN}, emit=Events()))
    assert out["verified_email"] == "maria.lee@gmail.com" and out["email_source_kind"] == "given_url"


def test_a_given_page_that_redirects_to_a_blocked_site_is_not_read(monkeypatch, site):
    site.pages[GIVEN] = page_at(GIVEN, "<p>Maria Lee, maria.lee@gmail.com</p>", final="https://www.spokeo.com/Maria-Lee")
    calls = scripted_search(monkeypatch, found({"address": "maria.lee@gmail.com", "url": GIVEN}), {PROFILE})
    emitted = Events()
    out = run(research.research_person({**TARGET, "url": GIVEN}, emit=emitted))
    assert ("search-1", "failed", "Could not open that page, searching instead") in emitted.lines()
    assert "maria.lee@gmail.com" not in calls[0]["prompt"] and out["verified_email"] is None


# ── Research: who Beaker writes to ───────────────────────────────────────────

@pytest.mark.parametrize("kind,reason", [("minor", "minor"), ("private", "private_person")])
def test_minors_and_private_people_are_never_researched(monkeypatch, site, kind, reason):
    raw = {**found({"address": "sam.young@gmail.com", "url": PROFILE}), "recipient_kind": kind}
    scripted_search(monkeypatch, raw, {PROFILE})
    emitted = Events()
    out = run(research.research_person(TARGET, emit=emitted))
    assert out == {"status": "not_found", "reason": reason, "message": research.REFUSAL_MESSAGES[reason]}
    assert site.fetched == [] and EM not in out["message"]
    assert emitted.lines()[-1] == ("pick", "failed", research.REFUSAL_LINE)
    assert_labels_ok(emitted)
    # Said even when a search failed: it is a refusal, not a failure to retry.
    scripted_search(monkeypatch, {**raw, "status": "not_found"}, set(), stats={"searches": 1, "errors": 1})
    assert run(research.research_person(TARGET, emit=Events()))["reason"] == reason


def test_a_page_that_says_they_are_a_school_student_is_refused_in_code(monkeypatch, site):
    raw = found()
    raw["person"] = {**raw["person"], "title": "Student", "organization": "Hillsborough High School"}
    scripted_search(monkeypatch, raw, {PROFILE})                         # the model called them professional
    out = run(research.research_person(TARGET, emit=Events()))
    assert out["status"] == "not_found" and out["reason"] == "minor" and site.fetched == []


@pytest.mark.parametrize("title,organization,minor", [
    ("High school student", "", True), ("Student", "Hillsborough High School", True), ("10th grader", "", True),
    ("High School Junior", "Tampa Prep", True), ("highschooler", "", True),
    ("Biology teacher", "Hillsborough High School", False), ("High school biology teacher", "", False),
    ("Graduate student", "USF", False), ("Student researcher", "University of South Florida", False),
    ("Coach", "Tampa High School", False), (None, None, False),
])
def test_who_looks_like_a_school_student(title, organization, minor):
    assert research.looks_like_a_school_student(title, organization) is minor


def test_the_research_prompt_and_tool_ask_who_they_are():
    schema = prompts.RESEARCH_TOOL["input_schema"]
    assert "recipient_kind" in schema["required"]
    assert schema["properties"]["recipient_kind"]["enum"] == ["professional", "minor", "private"]
    prompt = prompts.research_prompt(name="Maria Lee", organization="USF")
    assert "under 18" in prompt and "private individual" in prompt and 'recipient_kind to "minor"' in prompt


# ── Drafts: the rules in code ────────────────────────────────────────────────

RESEARCH = {
    "status": "found",
    "person": {"name": "Maria Lee", "title": "Associate Professor", "organization": "University of South Florida",
               "profile_url": PROFILE},
    "facts": [{"text": "The Lee Lab builds low-cost sensors to track coral bleaching.", "url": CONTACT}],
    "verified_email": "mlee@usf.edu",
}

GOOD_BODY = """Dear Dr. Lee,

I'm a junior at a public high school near Tampa. I read your lab's page about low-cost sensors that track coral bleaching, and it made me want to try building one for the saltwater tank in our Marine Science Club.

Would you be open to a 15-minute call, or one or two questions by email, about how a high school student could start learning this work? I know many labs can't host high school students, so a pointer to USF's outreach programs would be just as helpful.

Thank you so much,
Sam"""

GOOD_CLAIM = {"text": "your lab's page about low-cost sensors that track coral bleaching", "source_url": CONTACT}


def reply(body=GOOD_BODY, subject="High school student with a question about coral sensors", claims=None,
          facts=None, **extra):
    return {"safety_stop": False, "subject": subject, "body": body,
            "claims": [GOOD_CLAIM] if claims is None else claims,
            "facts_to_verify": ["Check that Dr. Lee is the right title."] if facts is None else facts, **extra}


def words(n):
    return " ".join(["word"] * n)


class Model:
    """A scripted tool_completion: replies in order, every call recorded."""

    def __init__(self, replies):
        self.replies, self.calls = list(replies), []

    async def __call__(self, **kwargs):
        self.calls.append(kwargs)
        r = self.replies.pop(0)
        if isinstance(r, Exception):
            raise r
        return r


@pytest.fixture
def model(monkeypatch):
    def install(*replies):
        m = Model(replies)
        monkeypatch.setattr(draft, "tool_completion", m)
        return m
    return install


def write(**overrides):
    args = dict(research=RESEARCH, record_text="Year: currently grade 11\nActivities: Marine Science Club",
                student_name="Sam Rivera", grade="11", purpose="research", voice="warm", length="brief",
                student_note="", answer=None, allow_question=False)
    args.update(overrides)
    return run(draft.write_draft(**args))


def test_word_count_counts_like_an_editor():
    assert draft.word_count("Dear Dr. Lee, I'm a junior.") == 6
    assert draft.word_count("a , b") == 2 and draft.word_count("") == 0 and draft.word_count(None) == 0
    assert draft.word_count(GOOD_BODY) < 110


@pytest.mark.parametrize("text", ["call 813-974-2011", "(813) 974-2011", "813.974.2011", "+1 813 974 2011",
                                  "8139742011", "+44 20 7946 0958", "cell: 1-813-974-2011"])
def test_phone_numbers_are_caught(text):
    assert draft.contains_phone(text)


@pytest.mark.parametrize("text", ["from 2019-2023", "in 2023 and 2024", "doi 10.1038/s41586-023-06647-8",
                                  "Tampa, FL 33620-5150", "a 15-minute call", "Room 1204", "3 of 12 sensors", ""])
def test_things_that_are_not_phone_numbers(text):
    assert not draft.contains_phone(text)


def test_a_clean_email_has_no_problems():
    assert draft.email_problems("High school student with a question about coral sensors", GOOD_BODY,
                                max_words=175) == []


@pytest.mark.parametrize("subject,body,fragment", [
    ("Question", words(176), "176 words"),
    ("", GOOD_BODY, "subject line is empty"),
    ("!!!", GOOD_BODY, "subject line is empty"),
    ("one two three four five six seven eight nine ten eleven twelve thirteen", GOOD_BODY, "13 words"),
    ("x" * 121, GOOD_BODY, "121 characters"),
    ("Question", "", "body is empty"),
    ("Question", GOOD_BODY + "\nMy cell is 813-974-2011.", "phone number"),
    ("Question", GOOD_BODY.replace("Sam", "[Your Name]"), "placeholder"),
    ("Question for {professor}", GOOD_BODY, "placeholder"),
    ("Question", GOOD_BODY + "\nI live at 4202 E Fowler Ave.", "street address"),
    ("Question", GOOD_BODY + "\nPO Box 1234", "street address"),
    ("Question", GOOD_BODY + "\nMy student ID: 20231234", "ID number"),
    ("Question", GOOD_BODY.replace("Sam", "<Your Name>"), "placeholder"),
])
def test_each_rule_is_reported(subject, body, fragment):
    problems = draft.email_problems(subject, body, max_words=175)
    assert any(fragment in p for p in problems), problems
    assert all(EM not in p for p in problems)


def test_a_pasted_link_or_address_in_angle_brackets_is_not_a_placeholder():
    body = GOOD_BODY + "\nMy project: <https://github.com/sam/reef-sensor> or <sam.r@school.org>"
    assert draft.email_problems("Coral sensors question", body, max_words=175) == []


@pytest.mark.parametrize("subject,line", [
    # A subject ending in a number, then "Dear Dr. Lee": two parts, never one phrase.
    ("Question from a high school student in the class of 2027", ""),
    ("Class of 2027 student", ""),
    ("Coral sensors question", "I organized the 2023 Blood Drive at my school."),
    ("Coral sensors question", "I helped run the 2024 Teen Court program."),
    ("Coral sensors question", "Our 2022 Winter Coat Drive collected 300 coats."),
    ("Coral sensors question", "I entered the 2023 Regional Science Fair First Place category."),
    ("Coral sensors question", "I won 3 Science Fair First Place ribbons."),
    ("Coral sensors question", "I read the 2023 Wall Street Journal article on reefs."),
    ("Coral sensors question", "In 2023 Dr. Lee's lab shared 2 St. Louis datasets."),
    ("Coral sensors question", "I led the 2023 Blood Drive. Tampa General sent 12 nurses."),
])
def test_years_and_event_names_are_not_street_addresses(subject, line):
    body = GOOD_BODY.replace("\n\nThank you", ("\n" + line if line else "") + "\n\nThank you")
    assert draft.email_problems(subject, body, max_words=175) == []


@pytest.mark.parametrize("line,address", [
    ("I live at 4202 E Fowler Ave.", "4202 E Fowler Ave"),
    ("Send it to 123 Oak Street.", "123 Oak Street"),
    ("It is 742 Evergreen Terrace, Springfield, IL.", "742 Evergreen Terrace"),
    ("I live at 12 Grimmauld Place.", "12 Grimmauld Place"),
    ("My address is 2020 Oak Drive.", "2020 Oak Drive"),
    ("The lab is near 350 5th Avenue.", "350 5th Avenue"),
    ("Find me at 55 Harbor Way Apt 3.", "55 Harbor Way"),
    ("Mail it to PO Box 1234.", "PO Box 1234"),
])
def test_real_street_addresses_are_caught_and_named(line, address):
    problems = draft.email_problems("Coral sensors question", GOOD_BODY + "\n" + line, max_words=175)
    assert f"It includes a street address ({address}). Take it out." in problems


def test_the_subject_is_checked_too():
    assert draft.email_problems("Meet me at 123 Oak Street", GOOD_BODY, max_words=175) == [
        "It includes a street address (123 Oak Street). Take it out."]


@pytest.mark.parametrize("body,first,signed", [
    ("I hope you have a great week.\n\nThank you", "Hope", False),
    ("Hope to hear from you", "Hope", False),
    ("Thanks,\nSam", "Sam", True), ("Thanks, Sam", "Sam", True), ("Best,\nSam Rivera", "Sam", True),
    ("Best,\nSam R.", "Sam", True), ("Thanks,\n- Sam", "Sam", True), ("Best wishes,\nHope", "Hope", True),
])
def test_only_a_name_on_the_last_line_is_a_signature(body, first, signed):
    out = draft._signed(body, first)
    assert out == body if signed else out.endswith("\n\n" + first) and out.startswith(body)


def test_the_word_floor_only_applies_when_asked():
    assert draft.email_problems("Hi there", "Thanks so much, Sam", max_words=175) == []
    assert "only 4 words" in draft.email_problems("Hi there", "Thanks so much, Sam", max_words=175,
                                                  min_words=40)[0]


def test_em_dashes_are_cleaned_and_paragraphs_kept():
    body = draft.clean_body(f"Dear Dr. Lee,\r\n\r\n\r\nYour page {EM} the sensors {EM} helped.\nIt ran 2019{EN}2023 "
                            f"and 2019-2023 -- twice.  **Thanks**,\nSam")
    assert EM not in body
    assert body == ("Dear Dr. Lee,\n\nYour page, the sensors, helped.\nIt ran 2019\u20132023 and 2019-2023, twice. "
                    "Thanks,\nSam")


def test_claims_must_be_sourced_and_really_in_the_body():
    body = "I read your lab\u2019s page about  Low-Cost sensors\nthat track coral bleaching, and liked it."
    claims = [
        {"text": "your lab's page about low-cost sensors that track coral bleaching.", "source_url": CONTACT},
        {"text": "your lab's page about low-cost sensors", "source_url": "https://made-up.example.org"},
        {"text": "You won the Nobel Prize", "source_url": CONTACT},
        {"text": "liked", "source_url": CONTACT},
        {"text": "YOUR LAB'S PAGE ABOUT LOW-COST SENSORS THAT TRACK CORAL BLEACHING", "source_url": CONTACT},
        "junk",
    ]
    out = draft.ground_claims(claims, body, {CONTACT, PROFILE})
    assert out == [{"text": "your lab\u2019s page about  Low-Cost sensors\nthat track coral bleaching",
                    "source_url": CONTACT}]
    assert out[0]["text"] in body
    assert draft.ground_claims("nope", body, {CONTACT}) == [] and draft.ground_claims(claims, "", {CONTACT}) == []


def test_a_good_draft_is_cleaned_signed_and_grounded(model):
    body = GOOD_BODY.replace("Thank you so much,\nSam", "Thank you so much,").replace("tank in", f"tank {EM} in")
    claims = [GOOD_CLAIM, {"text": "your lab's page", "source_url": "https://made-up.example.org"}]
    m = model(reply(body=body, subject=f"High school student {EM} coral sensors", claims=claims))
    emitted = Events()
    out = write(emit=emitted)
    assert set(out) == {"subject", "body", "claims", "facts_to_verify"}
    assert out["subject"] == "High school student, coral sensors"
    assert out["body"].endswith("Thank you so much,\nSam") and EM not in out["body"]
    assert out["claims"] == [GOOD_CLAIM]
    call = m.calls[0]
    assert call["model"] == OUTREACH_DRAFT_MODEL and call["system"] == prompts.DRAFT_SYSTEM
    assert call["tool"]["name"] == "write_email" and "question" not in call["tool"]["input_schema"]["properties"]
    assert "Sign with their first name only: Sam" in call["prompt"]
    assert "a junior (11th grade)" in call["prompt"] and RESEARCH["facts"][0]["text"] in call["prompt"]
    assert emitted.lines()[0] == ("draft", "active", "Writing a brief email in a warm and curious voice")
    assert ("check", "done", "1 detail tied to sources") in emitted.lines()
    assert_labels_ok(emitted)


def test_a_name_that_is_also_a_word_still_gets_its_signature(model):
    body = GOOD_BODY.replace("Thank you so much,\nSam", "I hope you have a great week.\n\nThank you")
    model(reply(body=body))
    out = write(student_name="Hope Rivera")
    assert out["body"].endswith("Thank you\n\nHope")


def test_without_a_name_nothing_is_invented_and_the_checklist_says_so(model):
    m = model(reply(body=GOOD_BODY.replace("\nSam", "")))
    out = write(student_name="")
    assert out["facts_to_verify"][0] == "Add your name at the end"
    assert "Sam" not in out["body"].splitlines()[-1]
    assert "Their name is not recorded" in m.calls[0]["prompt"]


def test_one_corrective_retry_then_success(model):
    m = model(reply(body=GOOD_BODY + "\nMy cell is 813-974-2011."), reply())
    emitted = Events()
    out = write(emit=emitted)
    assert out["body"] == GOOD_BODY and len(m.calls) == 2
    assert "phone number" in m.calls[1]["prompt"] and "COULD NOT BE USED" in m.calls[1]["prompt"]
    assert ("check", "active", "Fixing 1 problem in the draft") in emitted.lines()


def test_a_second_failure_is_draft_failed(model):
    m = model(reply(body=GOOD_BODY + " " + words(150)), reply(body=GOOD_BODY + " " + words(150)))
    emitted = Events()
    with pytest.raises(draft.DraftFailed) as err:
        write(emit=emitted)
    assert len(m.calls) == 2 and EM not in err.value.message and err.value.message
    assert emitted.lines()[-1][:2] == ("draft", "failed")


def test_unusable_replies_and_outages_are_draft_failed(model):
    model(None, None)
    with pytest.raises(draft.DraftFailed):
        write()
    model(ModelUnavailable("down"))
    with pytest.raises(draft.DraftFailed) as err:
        write()
    assert err.value.message == draft.UNAVAILABLE


def test_a_question_only_when_allowed(model):
    ask = "What got you interested in coral reefs? A class, a project, or something you read?"
    m = model(reply(body="", subject="", claims=[], facts=[], question=ask))
    assert write(allow_question=True) == {"question": ask}
    assert "question" in m.calls[0]["tool"]["input_schema"]["properties"]
    assert "ONE QUESTION ALLOWED" in m.calls[0]["prompt"]

    # Not allowed: a question instead of an email is a problem to fix, then a failure.
    m = model(reply(body="", subject="", claims=[], question=ask), reply(body="", subject="", claims=[], question=ask))
    with pytest.raises(draft.DraftFailed):
        write(allow_question=False)
    assert "Do not ask the student anything" in m.calls[1]["prompt"]

    # Not allowed, but an email came too: the email wins.
    model(reply(question=ask))
    assert write(allow_question=False)["body"] == GOOD_BODY

    # "none" in the question field is not a question.
    model(reply(question="none"))
    assert "body" in write(allow_question=True)


def test_the_answer_and_the_question_reach_the_prompt(model):
    m = model(reply())
    write(answer="I built a pH sensor for class last spring.", question="What got you interested?")
    prompt = m.calls[0]["prompt"]
    assert "I built a pH sensor for class last spring." in prompt and "What got you interested?" in prompt


def test_a_safety_stop_ends_at_once_with_a_trusted_adult(model):
    m = model(reply(body="", subject="", claims=[], safety_stop=True))
    with pytest.raises(draft.DraftFailed) as err:
        write(student_note="He said to text him my number and keep it between us.")
    assert err.value.message == draft.SAFETY_STOP and "adult" in err.value.message and len(m.calls) == 1
    model(reply(body="", subject="", claims=[], safety_stop=True))
    emitted = Events()
    with pytest.raises(draft.DraftFailed):
        write(emit=emitted)
    assert emitted.lines()[-1] == ("draft", "failed", "Stopped: this needs a trusted adult")


def test_a_draft_with_no_sourced_claim_is_retried_then_flagged(model):
    m = model(reply(claims=[]), reply(claims=[]))
    out = write()
    assert len(m.calls) == 2 and out["claims"] == []
    assert out["facts_to_verify"][-1].startswith("Check what the email says about their work")


def test_a_bad_purpose_never_reaches_the_model(model):
    m = model(reply())
    with pytest.raises(draft.DraftFailed):
        write(purpose="spam")
    assert m.calls == []


def test_rewrites_follow_the_chip_and_must_really_be_shorter(model):
    shorter = GOOD_BODY.replace(", and it made me want to try building one for the saltwater tank in our Marine "
                                "Science Club", "")
    m = model(reply(), reply(body=shorter))
    out = run(draft.rewrite_draft(research=RESEARCH, record_text="", student_name="Sam", subject="Coral sensors",
                                  body=GOOD_BODY, style="shorter", purpose="research", voice="warm"))
    assert out["body"] == shorter and len(m.calls) == 2
    assert "It is not shorter" in m.calls[1]["prompt"]
    assert m.calls[0]["model"] == OUTREACH_REWRITE_MODEL
    assert voices.TWEAKS["shorter"]["instruction"] in m.calls[0]["prompt"]
    assert GOOD_BODY.splitlines()[2] in m.calls[0]["prompt"]                  # the student's current text

    with pytest.raises(draft.DraftFailed):
        run(draft.rewrite_draft(research=RESEARCH, record_text="", student_name="Sam", subject="S", body=GOOD_BODY,
                                style="louder", purpose="research", voice="warm"))


FOLLOWUP = "Dear Dr. Lee,\n\nI'm following up on my note from last week in case it got buried. Would you have one tip on where a high school student could start with coral sensors? If someone else is better to ask, a pointer would be just as helpful.\n\nThanks,\nSam"


def test_the_follow_up_is_short_signed_and_checked(model):
    m = model({"body": FOLLOWUP.replace("\nSam", "")})
    out = run(draft.write_followup(research=RESEARCH, student_name="Sam", subject="Coral sensors",
                                   body_sent=GOOD_BODY, days_since=11))
    assert out.endswith("Thanks,\nSam") and draft.word_count(out) <= voices.FOLLOWUP_MAX_WORDS
    call = m.calls[0]
    assert call["model"] == OUTREACH_FOLLOWUP_MODEL and call["tool"]["name"] == "write_followup"
    assert "11 days ago" in call["prompt"] and GOOD_BODY.splitlines()[2] in call["prompt"]


def test_a_follow_up_over_the_cap_is_retried_then_draft_failed(model):
    long = "Dear Dr. Lee,\n\n" + words(80) + ".\n\nSam"
    m = model({"body": long}, {"body": FOLLOWUP})
    assert run(draft.write_followup(research=RESEARCH, student_name="Sam", subject="S", body_sent=GOOD_BODY,
                                    days_since=12)) == FOLLOWUP
    assert "The limit is 70" in m.calls[1]["prompt"]
    model({"body": long}, {"body": FOLLOWUP + " Call 813-974-2011."})
    with pytest.raises(draft.DraftFailed):
        run(draft.write_followup(research=RESEARCH, student_name="Sam", subject="S", body_sent=GOOD_BODY,
                                 days_since=12))


# ── Static options and prompts ───────────────────────────────────────────────

def _strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for v in value.values():
            yield from _strings(v)
    elif isinstance(value, (list, tuple)):
        for v in value:
            yield from _strings(v)


def test_no_dashes_in_anything_a_model_or_student_reads():
    texts = []
    for module in (prompts, voices, draft, research):
        texts += [s for name in dir(module) if name.isupper() for s in _strings(getattr(module, name))]
    texts += list(_strings(prompts.draft_tool(True)))
    texts.append(prompts.draft_prompt(research=RESEARCH, record_text="", first_name="Sam", grade="10",
                                      purpose="informational", voice="formal", length="fuller", student_note="",
                                      allow_question=True))
    texts.append(prompts.research_prompt(name="Maria Lee", organization="", given_url=PROFILE, page_text="x"))
    texts.append(prompts.followup_prompt(research=RESEARCH, first_name="", subject="S", body_sent="B", days_since=3))
    assert texts and not [t for t in texts if EM in t or EN in t]


def test_the_static_options_match_the_contract():
    assert set(voices.VOICES) == {"formal", "warm", "direct", "humble"} and voices.DEFAULT_VOICE == "warm"
    assert set(voices.PURPOSES) == {"research", "informational", "internship", "mentorship"}
    assert voices.LENGTHS["brief"]["words"] == (80, 110) and voices.LENGTHS["fuller"]["words"] == (120, 160)
    assert set(voices.TWEAKS) == {"shorter", "warmer", "formal", "smaller_ask"}
    assert voices.MAX_WORDS == 175 and voices.FOLLOWUP_MAX_WORDS == 70 and voices.DEFAULT_LENGTH == "brief"
    for v in voices.VOICES.values():
        assert v["label"] and v["hint"] and v["guidance"] and v["example"].count("?") + v["example"].count(".") >= 2
    for p in voices.PURPOSES.values():
        assert p["label"] and p["hint"] and p["ask"] and p["easy_out"]
    assert voices.valid_voice("warm") and not voices.valid_voice("loud") and not voices.valid_voice(None)
    assert voices.valid_purpose("research") and voices.valid_length("fuller") and voices.valid_tweak("smaller_ask")
    assert not voices.valid_length(["brief"]) and not voices.valid_tweak("") and not voices.valid_purpose(3)


def test_the_drafting_prompt_keeps_its_core_rules():
    system = prompts.DRAFT_SYSTEM
    for rule in ("first person", "high school", "175 words", "Exactly one small ask", "many labs cannot host",
                 "phone number", "safety_stop", "claims", "Program coordinator", "not asking for a job",
                 "renowned", "facts_to_verify", "never an em dash", "parent or teacher"):
        assert rule in system, rule


def test_a_person_whose_page_was_read_needs_only_one_search():
    from app.nodes.agents.outreach import research as r
    assert r.SHORTLIST_SEARCHES == 2 and r.PERSON_SEARCHES == 3 and r.PERSON_SEARCHES_PAGE_READ == 1
