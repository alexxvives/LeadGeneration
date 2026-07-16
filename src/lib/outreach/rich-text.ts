/**
 * Lightweight pitch formatting: HTML subset in the editor → HTML in drafts/send
 * (with plain-text fallback). Allowed tags: b/strong, i/em, u, ul/ol/li, br, div/p.
 */

const ALLOWED = new Set([
  "B",
  "STRONG",
  "I",
  "EM",
  "U",
  "UL",
  "OL",
  "LI",
  "BR",
  "DIV",
  "P",
  "SPAN",
]);

export function looksLikeHtml(input: string): boolean {
  return /<[a-z][\s\S]*>/i.test(input);
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain text → HTML fragment (newlines → <br>). */
export function plainToHtmlFragment(plain: string): string {
  const t = plain.replace(/\r\n/g, "\n").trim();
  if (!t) return "";
  return escapeHtml(t).replace(/\n/g, "<br>");
}

/** Collapse messy paste breaks; keep single/double line breaks. */
function tidyBreaks(html: string): string {
  return html
    .replace(/(?:<br\s*\/?>\s*){3,}/gi, "<br><br>")
    .replace(/(?:<br\s*\/?>\s*)+$/i, "")
    .replace(/^(?:<br\s*\/?>\s*)+/i, "")
    .trim();
}

/**
 * Strip unsafe tags; keep a small formatting subset.
 * Block elements (div/p) become content + <br> so Word/Docs pastes keep line breaks.
 * Styles (background, color) are dropped — tags are rebuilt without attributes.
 */
export function sanitizePitchHtml(html: string): string {
  if (typeof DOMParser === "undefined") {
    return tidyBreaks(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
        .replace(/\s(?:style|class|bgcolor|color)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
        .replace(/<\/?(div|p)[^>]*>/gi, "<br>")
        .replace(/(?:<br\s*\/?>\s*){3,}/gi, "<br><br>"),
    );
  }
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return "";

  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent ?? "";
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as Element;
    const tag = el.tagName;
    if (!ALLOWED.has(tag)) {
      return Array.from(el.childNodes).map(walk).join("");
    }
    if (tag === "BR") return "<br>";
    const inner = Array.from(el.childNodes).map(walk).join("");
    const t = tag.toLowerCase();
    if (t === "span") return inner;
    // Preserve line breaks from pasted block containers (Word/Docs/etc.).
    if (t === "div" || t === "p") {
      if (!inner.trim()) return "";
      return `${inner}<br>`;
    }
    if (t === "li") return `<li>${inner}</li>`;
    return `<${t}>${inner}</${t}>`;
  };

  return tidyBreaks(Array.from(root.childNodes).map(walk).join(""));
}

/**
 * Normalize pitch/body for draft storage + send: sanitize HTML, or wrap plain.
 * Server-side (no DOMParser) keeps a conservative tag strip.
 */
export function normalizePitchHtml(input: string): string {
  const raw = input.replace(/\r\n/g, "\n").trim();
  if (!raw) return "";
  if (!looksLikeHtml(raw)) return plainToHtmlFragment(raw);
  if (typeof DOMParser !== "undefined") return sanitizePitchHtml(raw);
  // Workers / Node: strip scripts + event handlers; keep known tags.
  return tidyBreaks(
    raw
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/\s(?:style|class|bgcolor|color)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/<\/?(?!\/?(?:b|strong|i|em|u|ul|ol|li|br|p)\b)[a-z][^>]*>/gi, "")
      .replace(/<\/p>\s*<p[^>]*>/gi, "<br><br>")
      .replace(/<\/?p[^>]*>/gi, "<br>"),
  );
}

/** Convert pitch HTML (or legacy plain) to email-safe plain text. */
export function richToPlain(input: string): string {
  const raw = input.replace(/\r\n/g, "\n").trim();
  if (!raw) return "";
  if (!looksLikeHtml(raw)) return raw;

  let s = raw;
  s = s.replace(/<\/p>\s*<p>/gi, "\n\n");
  s = s.replace(/<p[^>]*>/gi, "");
  s = s.replace(/<\/p>/gi, "\n\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/li>/gi, "\n");
  s = s.replace(/<li[^>]*>/gi, "• ");
  s = s.replace(/<\/?(ul|ol)[^>]*>/gi, "\n");
  s = s.replace(/<\/?(strong|b)>/gi, "");
  s = s.replace(/<\/?(em|i)>/gi, "");
  s = s.replace(/<\/?u>/gi, "");
  s = s.replace(/<[^>]+>/g, "");
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

/** Plain → minimal HTML for the editor (preserve newlines). */
export function plainToRich(plain: string): string {
  const t = plain.replace(/\r\n/g, "\n").trim();
  if (!t) return "";
  if (looksLikeHtml(t)) return sanitizePitchHtml(t);
  return t
    .split(/\n/)
    .map((line) => {
      const escaped = escapeHtml(line);
      return escaped || "<br>";
    })
    .join("<br>");
}

/** Wrap body HTML in a minimal email document fragment for ESP `html` fields. */
export function toEmailHtmlDocument(bodyHtml: string): string {
  const inner = normalizePitchHtml(bodyHtml);
  if (!inner) return "";
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.55;color:#111">${inner}</div>`;
}
