import mammoth from 'mammoth';
import XLSX from 'xlsx';

/** 从上传文件提取可供 AI 阅读的纯文本 */
export async function extractQuizImportText(buffer, fileName) {
  const name = String(fileName || '').toLowerCase();
  if (name.endsWith('.docx')) {
    const extracted = await mammoth.extractRawText({ buffer });
    return extracted.value || '';
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const parts = [];
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      parts.push(`【工作表：${sheetName}】`);
      for (const row of matrix) {
        if (!Array.isArray(row)) continue;
        const line = row.map((c) => String(c ?? '').trim()).filter(Boolean).join('\t');
        if (line) parts.push(line);
      }
    }
    return parts.join('\n');
  }
  return '';
}
