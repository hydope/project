import { Fragment } from 'react';

// Inline links in blog body text.
//
// Post bodies are plain-text blocks ({ t, x }) — historically rendered
// verbatim, so no post could contain a hyperlink at all (the CreateMyBiodata
// reciprocal link sat unplaced for days because every route hit this wall).
// Authors now write markdown-style links — [link text](https://example.com) —
// and this splits the text into plain strings and <a> elements. Only
// http/https URLs become links; everything else, including malformed link
// syntax, stays escaped plain text exactly as React renders strings today.
//
// The PHP SSR renderer (php-api/routes/blog-ssr.php, blogSsrInlineLinks)
// implements the identical rule so the served HTML and the app agree.
const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

export function renderInlineLinks(text) {
  const s = String(text ?? '');
  if (!s.includes('[')) return s;
  const parts = [];
  let last = 0;
  let key = 0;
  for (const m of s.matchAll(LINK_RE)) {
    if (m.index > last) parts.push(<Fragment key={key++}>{s.slice(last, m.index)}</Fragment>);
    parts.push(<a key={key++} href={m[2]}>{m[1]}</a>);
    last = m.index + m[0].length;
  }
  if (!parts.length) return s;
  if (last < s.length) parts.push(<Fragment key={key++}>{s.slice(last)}</Fragment>);
  return parts;
}
