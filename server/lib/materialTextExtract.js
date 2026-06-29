import fs from 'fs';
import mammoth from 'mammoth';
import XLSX from 'xlsx';

const TEXT_EXTS = new Set(['txt', 'md', 'markdown', 'csv', 'json']);
const EXTRACTABLE_EXT =
  /\.(docx|doc|txt|md|markdown|csv|xlsx|xls|pdf)$/i;

export function isExtractableFileName(fileName) {
  return EXTRACTABLE_EXT.test(String(fileName || ''));
}

function sheetMatrixToText(wb) {
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
  return parts.join('\n').trim();
}

/**
 * @returns {{ text: string, status: 'ok' | 'empty' | 'unsupported' | 'error', error?: string }}
 */
export async function extractMaterialFileTextFromBuffer(buffer, fileName) {
  const name = String(fileName || '').toLowerCase();
  const ext = name.split('.').pop() ?? '';

  try {
    if (name.endsWith('.docx') || name.endsWith('.doc')) {
      const { value } = await mammoth.extractRawText({ buffer });
      const text = (value || '').trim();
      return { text, status: text ? 'ok' : 'empty' };
    }

    if (TEXT_EXTS.has(ext)) {
      const text = buffer.toString('utf8').trim();
      return { text, status: text ? 'ok' : 'empty' };
    }

    if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
      const wb = XLSX.read(buffer, { type: 'buffer' });
      const text = sheetMatrixToText(wb);
      return { text, status: text ? 'ok' : 'empty' };
    }

    if (name.endsWith('.pdf')) {
      const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js');
      const parsed = await pdfParse(buffer);
      const text = (parsed.text || '').trim();
      return { text, status: text ? 'ok' : 'empty' };
    }

    return { text: '', status: 'unsupported' };
  } catch (err) {
    return {
      text: '',
      status: 'error',
      error: err instanceof Error ? err.message : '解析失败',
    };
  }
}

export async function extractMaterialFileTextFromPath(absPath, fileName) {
  if (!fs.existsSync(absPath)) {
    return { text: '', status: 'error', error: '文件不存在' };
  }
  const buffer = fs.readFileSync(absPath);
  return extractMaterialFileTextFromBuffer(buffer, fileName);
}
