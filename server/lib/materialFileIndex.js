import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from '../db/database.js';
import {
  extractMaterialFileTextFromPath,
  isExtractableFileName,
} from './materialTextExtract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.join(__dirname, '..');

/** 单文件入库正文上限（字符） */
export const MAX_STORED_TEXT_PER_FILE = 80_000;

const updateExtract = (database) =>
  database.prepare(`
    UPDATE material_files
    SET extracted_text = ?, extract_status = ?, extract_error = ?, extracted_at = datetime('now')
    WHERE id = ?
  `);

export function absPathForStorage(storagePath) {
  return path.join(SERVER_ROOT, storagePath);
}

export async function indexMaterialFileRow(database, fileRow) {
  const fileName = fileRow.file_name;
  if (!isExtractableFileName(fileName)) {
    updateExtract(database).run(
      '',
      'unsupported',
      '该格式暂不支持自动解析（可转为 docx/pdf/txt 后重新上传）',
      fileRow.id,
    );
    return { id: fileRow.id, status: 'unsupported' };
  }

  const abs = absPathForStorage(fileRow.storage_path);
  const result = await extractMaterialFileTextFromPath(abs, fileName);
  let text = result.text || '';
  let status = result.status;
  if (text.length > MAX_STORED_TEXT_PER_FILE) {
    text = `${text.slice(0, MAX_STORED_TEXT_PER_FILE)}…（正文过长已截断存储）`;
  }
  if (status === 'ok' && !text) status = 'empty';
  updateExtract(database).run(
    text,
    status,
    result.error || null,
    fileRow.id,
  );
  return { id: fileRow.id, status, chars: text.length };
}

export async function indexMaterialFileById(database, fileId) {
  const row = database.prepare('SELECT * FROM material_files WHERE id = ?').get(fileId);
  if (!row) return null;
  return indexMaterialFileRow(database, row);
}

export async function indexAllMaterialFiles(database) {
  const rows = database.prepare('SELECT * FROM material_files ORDER BY created_at').all();
  const results = [];
  for (const row of rows) {
    results.push(await indexMaterialFileRow(database, row));
  }
  return results;
}

/** 未索引或索引失败时重新解析 */
export async function ensureFileIndexed(database, fileRow) {
  if (
    fileRow.extract_status === 'ok' &&
    fileRow.extracted_text &&
    String(fileRow.extracted_text).length > 0
  ) {
    return fileRow;
  }
  if (fileRow.extract_status === 'unsupported') {
    return fileRow;
  }
  await indexMaterialFileRow(database, fileRow);
  return database.prepare('SELECT * FROM material_files WHERE id = ?').get(fileRow.id);
}

export async function ensureAllFilesIndexed() {
  const database = getDb();
  const rows = database.prepare('SELECT * FROM material_files').all();
  for (const row of rows) {
    await ensureFileIndexed(database, row);
  }
}
