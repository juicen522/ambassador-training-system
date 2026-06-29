/** 活动正文 VI：中文自动用思源黑体 Book，英文/数字自动用 Gotham Book */

export const ACTIVITY_VI_FONT_FAMILY =
  "'Esquel Activity VI', 'Noto Sans SC', sans-serif";

/** 仅保留白名单内联样式；其余（含 list-style-position、padding-left）一律剥离 */
const ALLOWED_STYLE_KEYS = new Set([
  'text-align',
  'list-style-type',
  'margin-left',
]);

function stripViInlineStyles(style: string) {
  const kept = style
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((rule) => {
      const key = rule.split(':')[0]?.trim().toLowerCase();
      return Boolean(key && ALLOWED_STYLE_KEYS.has(key));
    });
  return kept.join('; ');
}

export function cleanListLayoutInlineStyles(root: ParentNode) {
  root.querySelectorAll('ul, ol, li').forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    el.style.removeProperty('list-style-position');
    if (el.tagName === 'LI') {
      el.style.removeProperty('padding-left');
      el.style.removeProperty('list-style-type');
    }
    if (el.tagName === 'UL' || el.tagName === 'OL') {
      el.style.removeProperty('padding-left');
    }
    if (!el.getAttribute('style')?.trim()) el.removeAttribute('style');
  });
}

function normalizeDom(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.body.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((el) => {
    const p = document.createElement('p');
    p.innerHTML = el.innerHTML;
    const style = el.getAttribute('style');
    if (style) p.setAttribute('style', style);
    el.replaceWith(p);
  });
  doc.body.querySelectorAll('*').forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    el.removeAttribute('data-vi-font');
    el.removeAttribute('face');
    const nextStyle = stripViInlineStyles(el.getAttribute('style') || '');
    if (nextStyle) el.setAttribute('style', nextStyle);
    else el.removeAttribute('style');
  });
  doc.body.querySelectorAll('font').forEach((el) => {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  });
  doc.body.querySelectorAll('i, em').forEach((el) => {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  });
  cleanListLayoutInlineStyles(doc.body);
  return doc.body.innerHTML.trim();
}

function normalizeRegex(html: string): string {
  let s = html;
  s = s.replace(/data-vi-font="[^"]*"/gi, '');
  s = s.replace(/\sface="[^"]*"/gi, '');
  s = s.replace(/font-family\s*:\s*[^;"']+;?/gi, '');
  s = s.replace(/font-weight\s*:\s*[^;"']+;?/gi, '');
  s = s.replace(/font-size\s*:\s*[^;"']+;?/gi, '');
  s = s.replace(/line-height\s*:\s*[^;"']+;?/gi, '');
  s = s.replace(/list-style-position\s*:\s*[^;"']+;?/gi, '');
  s = s.replace(/font-style\s*:\s*[^;"']+;?/gi, '');
  s = s.replace(/<\/?font[^>]*>/gi, '');
  s = s.replace(/<(i|em)(\s[^>]*)?>/gi, '');
  s = s.replace(/<\/(i|em)>/gi, '');
  s = s.replace(/\sstyle="\s*"/gi, '');
  return s.trim();
}

/** 清洗 HTML，统一由 Esquel Activity VI 按中英文自动渲染 */
export function normalizeActivityCopywriting(html: string): string {
  if (!html?.trim()) return '';
  if (typeof DOMParser !== 'undefined') {
    try {
      return normalizeDom(html);
    } catch {
      return normalizeRegex(html);
    }
  }
  return normalizeRegex(html);
}

export function sanitizePastedHtml(html: string): string {
  return normalizeActivityCopywriting(html);
}
