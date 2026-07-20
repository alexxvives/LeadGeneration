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

  /**
   * contenteditable often keeps the first line as a bare text node, then wraps
   * later lines in <div>/<p>. Without a break before those blocks, the preview
   * concatenates ("Hello!Next sentence"). Empty blocks are blank lines.
   */
  const walkChildren = (parent: Element): string => {
    let out = "";
    let prev = "";
    for (const node of Array.from(parent.childNodes)) {
      const chunk = walk(node);
      if (!chunk) continue;
      const block =
        node.nodeType === Node.ELEMENT_NODE &&
        ["DIV", "P"].includes((node as Element).tagName);
      if (
        block &&
        prev &&
        !/(?:<br\s*\/?>\s*)$/i.test(prev) &&
        !/^<(?:ul|ol|li)\b/i.test(chunk)
      ) {
        out += "<br>";
      }
      out += chunk;
      prev = chunk;
    }
    return out;
  };

  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      // textContent decodes entities — re-escape so `&lt;img…&gt;` cannot
      // become live markup in the sanitizer output (stored XSS / email HTML).
      return escapeHtml(node.textContent ?? "");
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as Element;
    const tag = el.tagName;
    if (!ALLOWED.has(tag)) {
      return walkChildren(el);
    }
    if (tag === "BR") return "<br>";
    const inner = walkChildren(el);
    const t = tag.toLowerCase();
    // Unwrap spans (incl. editor-only placeholder tints) — never persist them.
    if (t === "span") return inner;
    // Preserve line breaks from pasted / contenteditable block containers.
    if (t === "div" || t === "p") {
      // Empty block = intentional blank line (Enter on empty line).
      if (!inner.trim()) return "<br>";
      return `${inner}<br>`;
    }
    if (t === "li") return `<li>${inner}</li>`;
    return `<${t}>${inner}</${t}>`;
  };

  return tidyBreaks(walkChildren(root));
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
  // Workers / Node: decode entities so encoded tags become real tags and get
  // stripped; then escape text between remaining (allowed) tags.
  const decoded = raw
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
  const stripped = decoded
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(?:style|class|bgcolor|color)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/<\/?(?!\/?(?:b|strong|i|em|u|ul|ol|li|br|p)\b)[a-z][^>]*>/gi, "")
    .replace(/<\/p>\s*<p[^>]*>/gi, "<br><br>")
    .replace(/<\/?p[^>]*>/gi, "<br>");
  const escaped = stripped.replace(
    /(^|>)([^<]*)/g,
    (_m, boundary: string, text: string) => boundary + escapeHtml(text),
  );
  return tidyBreaks(escaped);
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

const TEMPLATE_PH_RE = /\{(company|lead_name|location)\}/gi;

/**
 * Tint `{company}` / `{lead_name}` / `{location}` in editor HTML.
 * Markers use data-ph so sanitizePitchHtml preserves them (no class attrs).
 */
export function highlightTemplatePlaceholders(html: string): string {
  if (!html) return "";
  // Unwrap prior markers so we don't nest.
  const bare = html.replace(/<span data-ph="1">(\{[^}]+\})<\/span>/gi, "$1");
  return bare.replace(
    TEMPLATE_PH_RE,
    '<span data-ph="1">{$1}</span>',
  );
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
