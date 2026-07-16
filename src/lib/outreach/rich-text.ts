/**
 * Lightweight pitch formatting: HTML subset in the editor → plain text in emails.
 * Allowed tags: b/strong, i/em, u, ul/ol/li, br, div/p.
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

/** Strip unsafe tags; keep a small formatting subset. */
export function sanitizePitchHtml(html: string): string {
  if (typeof DOMParser === "undefined") {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/on\w+="[^"]*"/gi, "");
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
    if (t === "span" || t === "div") return inner;
    if (t === "p") return inner ? `<p>${inner}</p>` : "";
    return `<${t}>${inner}</${t}>`;
  };

  return Array.from(root.childNodes).map(walk).join("").trim();
}

/** Convert pitch HTML (or legacy plain) to email-safe plain text. */
export function richToPlain(input: string): string {
  const raw = input.replace(/\r\n/g, "\n").trim();
  if (!raw) return "";
  if (!/<[a-z][\s\S]*>/i.test(raw)) return raw;

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
  if (/<[a-z][\s\S]*>/i.test(t)) return t;
  return t
    .split(/\n/)
    .map((line) => {
      const escaped = line
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return escaped || "<br>";
    })
    .join("<br>");
}
