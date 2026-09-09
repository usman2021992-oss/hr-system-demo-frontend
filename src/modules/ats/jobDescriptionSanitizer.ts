// ---------------------------------------------------------------------------
// Editor-side job description cleanup
//
// Mirrors backend src/utils/jobDescription.ts. The backend is authoritative —
// it sanitises on every save — but cleaning here too means the user sees the
// clean version immediately instead of discovering on reload that half their
// paste vanished.
//
// The case this exists for: pasting from Word carries a conditional-comment
// block, <!--[if gte mso 9]><xml> … <w:LsdException/> … <m:brkBinSub/> …
// </xml><![endif]-->. The previous handler removed disallowed *elements* and
// stripped attributes, but that markup lives inside a COMMENT node, which
// querySelectorAll cannot reach — so all of it survived into the database.
// Job posting 20 stored 37,138 characters for 3,207 characters of visible text.
// ---------------------------------------------------------------------------

/**
 * Kept in sync with ALLOWED_DESCRIPTION_TAGS in the backend utility: the tags
 * agreed with the client (p, br, ul, ol, li, strong, em) plus <u>, because the
 * toolbar exposes an underline button.
 */
const ALLOWED_TAGS = new Set(['P', 'BR', 'UL', 'OL', 'LI', 'STRONG', 'EM', 'U']);

/** document.execCommand emits these; fold them into the semantic equivalents. */
const TAG_REPLACEMENTS: Record<string, string> = { B: 'STRONG', I: 'EM' };

/** Never keep the text content of these, only drop them whole. */
const DROP_WHOLE = new Set([
  'SCRIPT', 'STYLE', 'HEAD', 'META', 'LINK', 'TITLE', 'OBJECT', 'EMBED',
  'IFRAME', 'NOSCRIPT', 'XML', 'TEXTAREA', 'SELECT', 'OPTION',
]);

function removeCommentNodes(root: HTMLElement): void {
  // This is the line that actually kills the Office payload.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  const comments: Comment[] = [];
  let node = walker.nextNode();
  while (node) {
    comments.push(node as Comment);
    node = walker.nextNode();
  }
  comments.forEach((c) => c.remove());
}

/** Replace an element with its own children, keeping the text. */
function unwrap(el: Element): void {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

function cleanElements(root: HTMLElement): void {
  // Snapshot first: the list is live and we mutate as we go. `root.contains`
  // (not `isConnected`) is the staleness check — the container is detached from
  // the document, so isConnected would be false for every node here.
  Array.from(root.querySelectorAll('*')).forEach((el) => {
    if (!root.contains(el)) return;
    const tag = el.tagName.toUpperCase();

    // Namespaced Office tags: <o:p>, <w:sdt>, <m:mathPr>, <v:shape>, <st1:city>.
    if (tag.includes(':') || DROP_WHOLE.has(tag)) {
      el.remove();
      return;
    }

    const replacement = TAG_REPLACEMENTS[tag];
    if (replacement) {
      const next = document.createElement(replacement);
      next.innerHTML = el.innerHTML;
      el.replaceWith(next);
      return;
    }

    // Headings become paragraphs rather than disappearing.
    if (/^H[1-6]$/.test(tag)) {
      const p = document.createElement('p');
      p.innerHTML = el.innerHTML;
      el.replaceWith(p);
      return;
    }

    if (!ALLOWED_TAGS.has(tag)) {
      // span, div, font, a, table … keep the words, drop the wrapper.
      unwrap(el);
      return;
    }

    // Allowed tag: no attributes survive (no class, style, lang, mso-*).
    Array.from(el.attributes).forEach((attr) => el.removeAttribute(attr.name));
  });
}

function tidy(html: string): string {
  return html
    .replace(/&nbsp;/g, ' ')
    .replace(/<p>(\s|<br\s*\/?>)*<\/p>/gi, '')
    .replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Clean an HTML fragment down to the allowed subset. Safe to call repeatedly —
 * running it on already-clean content returns the same string.
 */
export function sanitizeDescriptionHtml(html: string): string {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  removeCommentNodes(tmp);
  cleanElements(tmp);

  // Nested unwrapping can expose a second layer (a <span> inside a removed
  // <div>), so settle before serialising.
  let previous = '';
  let current = tmp.innerHTML;
  let guard = 0;
  while (current !== previous && guard < 5) {
    previous = current;
    cleanElements(tmp);
    current = tmp.innerHTML;
    guard += 1;
  }

  return tidy(current);
}

/** True when a fragment carries Office markup, used to report what was removed. */
export function looksLikeOfficeMarkup(html: string): boolean {
  return /<!--\[if|mso-|<o:|<w:|<m:|urn:schemas-microsoft-com/i.test(html || '');
}
