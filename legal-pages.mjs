// Rebuilds dist/privacy-policy/ and dist/terms-of-service/ from the live pages on
// howardsdraperies.com, so the consultation form can link to policies on this
// domain. The main site owns the wording: run `node legal-pages.mjs` whenever
// it changes its Privacy Policy or Terms, and commit the result. The build never
// runs this, so a main-site outage can't break a deploy.
import {mkdir, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const ORIGIN = 'https://howardsdraperies.com';
export const PAGES = [
  {path: 'privacy-policy', title: 'Privacy Policy'},
  {path: 'terms-of-service', title: 'Terms & Conditions'},
];
// Everything the main site's legal pages use. Anything else (a script, a form,
// an image) stops the rebuild rather than being copied blind.
const ALLOWED = new Set(['a', 'h1', 'h2', 'h3', 'li', 'p', 'section', 'strong', 'ul']);

// Keeps the main element's text and structure, without the main site's classes:
// <div> and <span> wrappers are dropped, links keep only their address.
export function legalContent(page) {
  const start = page.indexOf('<main');
  const end = page.indexOf('</main>');
  if (start < 0 || end < start) throw new Error('No <main> element found');
  const main = page.slice(page.indexOf('>', start) + 1, end).replace(/<!-- -->/g, '');
  return main.replace(/<(\/?)([a-z0-9]+)([^>]*)>/gi, (tag, close, name, attrs) => {
    name = name.toLowerCase();
    if (name === 'div') return '';
    // The breadcrumb's "·" sits in a span whose margin spaced it out.
    if (name === 'span') return ' ';
    if (!ALLOWED.has(name)) throw new Error(`Unexpected <${name}> in the legal page`);
    if (close) return `</${name}>`;
    if (name !== 'a') return `<${name}>`;
    const href = attrs.match(/href="([^"]*)"/)?.[1];
    if (!href) throw new Error('Link without an address');
    return /^https?:/.test(href) ? `<a href="${href}" target="_blank" rel="noopener">` : `<a href="${href}">`;
  });
}

export function legalPage({title, content}) {
  const pageTitle = title.replace('&', '&amp;');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${pageTitle} | Howard’s Draperies</title><meta name="robots" content="noindex"/><link rel="icon" type="image/svg+xml" href="/favicon.svg"/><link rel="stylesheet" href="/legal.css"/></head><body><a class="skip-link" href="#main-content">Skip to content</a><header class="legal-header"><a href="/" aria-label="Howard’s Draperies motorized shades"><img src="/assets/logo.webp" alt="Howard’s Draperies" width="122" height="62"/></a><a class="legal-phone" href="tel:+13034494337">(303) 449-4337</a></header><main id="main-content" class="legal" tabindex="-1">${content}</main><footer class="legal-footer"><a href="/privacy-policy/">Privacy Policy</a><a href="/terms-of-service/">Terms of Service</a><a href="${ORIGIN}/">howardsdraperies.com</a></footer></body></html>\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const {path, title} of PAGES) {
    const response = await fetch(`${ORIGIN}/${path}/`);
    if (!response.ok) throw new Error(`${ORIGIN}/${path}/ returned HTTP ${response.status}`);
    const content = legalContent(await response.text());
    await mkdir(new URL(`./dist/${path}/`, import.meta.url), {recursive: true});
    await writeFile(new URL(`./dist/${path}/index.html`, import.meta.url), legalPage({title, content}));
    console.log(`dist/${path}/index.html from ${ORIGIN}/${path}/`);
  }
}
