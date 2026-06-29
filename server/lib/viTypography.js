/**
 * 活动正文 VI：中文 → 思源黑体 Book；英文/数字 → Gotham Book
 * 展示层由 CSS font-family「Esquel Activity VI」+ unicode-range 自动分字重。
 */

const CJK_UNICODE_RANGE =
  'U+4E00-9FFF,U+3400-4DBF,U+F900-FAFF,U+3000-303F,U+FF00-FFEF,U+FE30-FE4F';

export const ACTIVITY_VI_FONT_FAMILY = "'Esquel Activity VI', 'Noto Sans SC', sans-serif";

const ALLOWED_STYLE_KEYS = new Set([
  'text-align',
  'list-style-type',
  'margin-left',
]);

function stripViInlineStyles(style) {
  if (!style) return '';
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

/** 清洗 HTML，去掉非 VI 的字体内联样式与加粗斜体标签 */
export function normalizeActivityCopywriting(html) {
  if (!html?.trim()) return '';

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
  s = s.replace(/\sstyle=''/gi, '');

  return s.trim();
}

export function migrateActivitiesCopywritingVi(database) {
  const rows = database.prepare('SELECT id, copywriting FROM activities').all();
  const update = database.prepare(
    'UPDATE activities SET copywriting = ? WHERE id = ?',
  );
  let changed = 0;
  for (const row of rows) {
    const next = normalizeActivityCopywriting(row.copywriting || '');
    if (next !== (row.copywriting || '')) {
      update.run(next, row.id);
      changed += 1;
    }
  }
  if (changed > 0) {
    console.log(`[vi] 已规范化 ${changed} 条活动文案`);
  }
}

export { CJK_UNICODE_RANGE };
