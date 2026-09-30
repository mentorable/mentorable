// The ways out of Mentorable that need no Gmail: copy the email, or open it
// in the student's own mail app. Plus the checks the review screen runs
// before offering Send (the backend checks them again, and more).

import { wordCount } from "./options.js";

/** A mailto: link with the subject and body filled in. Line breaks become
 *  CRLF, as mail clients expect; the "@" is left readable. */
export function mailtoHref({ to = "", subject = "", body = "" }) {
  const addr = to ? encodeURIComponent(to.trim()).replace(/%40/gi, "@") : "";
  const query = [];
  if (subject) query.push(`subject=${encodeURIComponent(subject)}`);
  if (body) query.push(`body=${encodeURIComponent(body.replace(/\r?\n/g, "\r\n"))}`);
  return `mailto:${addr}${query.length ? `?${query.join("&")}` : ""}`;
}

/** The email as one block to paste: the subject line, a blank line, the body. */
export function emailAsText({ subject = "", body = "" }) {
  return subject ? `Subject: ${subject}\n\n${body}` : body;
}

/** Copy text to the clipboard. true when it worked. */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* blocked: try the old way */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const validEmail = (v) => EMAIL_RE.test(String(v || "").trim());

// The most common personal mailboxes. The backend's list is longer; this is
// only for an early heads-up before the student presses Send.
const PERSONAL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "icloud.com",
  "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "mail.com", "comcast.net",
]);
export function looksPersonal(address) {
  const domain = String(address || "").trim().toLowerCase().split("@")[1] || "";
  return PERSONAL.has(domain);
}

const PLACEHOLDER = /\[[^[\]\n]{0,80}\]|\{[^{}\n]{0,80}\}|<[A-Za-z][A-Za-z ]{0,40}>/;

/** What stops this email from going out through Gmail as it is, in plain
 *  words. Empty = fine. */
export function sendProblems({ to, subject, body, maxWords }) {
  const out = [];
  if (!String(to || "").trim()) out.push("Add their email address.");
  else if (!validEmail(to)) out.push("The email address doesn't look right.");
  if (!String(subject || "").trim()) out.push("Add a subject line.");
  if (!String(body || "").trim()) out.push("The email is empty.");
  const n = wordCount(body);
  if (maxWords && n > maxWords) out.push(`The email is ${n} words. Beaker sends up to ${maxWords}.`);
  const ph = PLACEHOLDER.exec(`${subject}\n${body}`);
  if (ph) out.push(`It still has a placeholder: ${ph[0].slice(0, 40)}. Fill it in or write around it.`);
  return out;
}
