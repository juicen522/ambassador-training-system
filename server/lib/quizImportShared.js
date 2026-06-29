/** 题库导入共用：题型与选项行归一化 */

export function normalizeQuestionType(raw) {
  const t = String(raw || '').trim().toLowerCase().replace(/\s+/g, '');
  if (['single', '单选', '单选题', '单项选择', '单项选择题'].includes(t)) return 'single';
  if (['multiple', 'multi', '多选', '多选题', '多项选择', '多项选择题'].includes(t)) return 'multiple';
  if (['boolean', 'judge', '判断', '判断题'].includes(t)) return 'boolean';
  if (['text', 'qa', '问答', '问答题', '简答', '简答题'].includes(t)) return 'text';
  return 'single';
}

export function optionsFromImportRow(row) {
  if (Array.isArray(row?.options) && row.options.length > 0) {
    return row.options.map((x) => String(x || '').trim()).filter(Boolean);
  }
  return [row?.optionA, row?.optionB, row?.optionC, row?.optionD]
    .map((x) => String(x || '').trim())
    .filter(Boolean);
}
