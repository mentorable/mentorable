// Reading a student's Word file (.docx) in the browser, so their essay never
// goes to the server to be opened. A .docx is a zip; its text is in
// word/document.xml. This reads the zip's directory, inflates that one entry
// with the browser's own DecompressionStream, and keeps each paragraph's text.
// Plain .txt files are read as they are.

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

export class DocFileError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export const DOC_FILE_MESSAGES = {
  too_big: "That file is over 5 MB, which is far more than an essay. Save just the essay in its own file.",
  old_word: "That's an older Word file (.doc). In Word, choose File, Save As, and pick Word Document (.docx), then try that file.",
  not_docx: "Quill can open a Word file (.docx) or a plain text file (.txt). That file is neither.",
  unreadable: "Quill couldn't read that file. Open it in Word, save it again as .docx, and try once more.",
  empty: "That file has no text in it.",
  unsupported: "This browser can't open Word files. Copy the essay from Word and paste it into your draft instead.",
};

function fail(code) { throw new DocFileError(code, DOC_FILE_MESSAGES[code]); }

async function inflate(bytes) {
  if (typeof DecompressionStream === "undefined") fail("unsupported");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The bytes of one entry in a zip, or null when it is not there. */
export async function zipEntry(buffer, wanted) {
  const view = new DataView(buffer);
  const u8 = new Uint8Array(buffer);
  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  for (let n = 0; n < count && p + 46 <= buffer.byteLength; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) return null;
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = decoder.decode(u8.subarray(p + 46, p + 46 + nameLen));
    if (name === wanted) {
      if (view.getUint32(local, true) !== 0x04034b50) return null;
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const data = u8.subarray(start, start + size);
      if (method === 0) return data;
      if (method === 8) return inflate(data);
      return null;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

/** The paragraphs of a document.xml, as plain text with a blank line between them. */
export function docxText(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) fail("unreadable");
  const paras = [];
  for (const p of Array.from(doc.getElementsByTagNameNS(W, "p"))) {
    let text = "";
    const walk = (node) => {
      for (const c of Array.from(node.childNodes)) {
        if (c.nodeType !== 1) continue;
        if (c.namespaceURI === W && c.localName === "t") text += c.textContent;
        else if (c.namespaceURI === W && c.localName === "tab") text += "\t";
        else if (c.namespaceURI === W && (c.localName === "br" || c.localName === "cr")) text += "\n";
        else if (c.namespaceURI === W && c.localName === "p") continue;     // a nested paragraph is its own
        else walk(c);
      }
    };
    walk(p);
    if (text.trim()) paras.push(text.trim());
  }
  return paras.join("\n\n");
}

/** { title, text, fileName, source } from a File the student picked. */
export async function readDocFile(file) {
  if (!file) fail("not_docx");
  if (file.size > MAX_FILE_BYTES) fail("too_big");
  const name = file.name || "";
  const lower = name.toLowerCase();
  const title = name.replace(/\.(docx|txt)$/i, "").trim();
  if (lower.endsWith(".doc")) fail("old_word");
  let text;
  if (lower.endsWith(".txt") || file.type === "text/plain") {
    text = await file.text();
  } else if (lower.endsWith(".docx")) {
    let xml;
    try {
      const bytes = await zipEntry(await file.arrayBuffer(), "word/document.xml");
      if (!bytes) fail("unreadable");
      xml = new TextDecoder().decode(bytes);
    } catch (e) {
      if (e instanceof DocFileError) throw e;
      fail("unreadable");
    }
    text = docxText(xml);
  } else {
    fail("not_docx");
  }
  text = text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 60000);
  if (!text) fail("empty");
  return { title, text, fileName: name, source: lower.endsWith(".docx") ? "word" : "text" };
}
