/**
 * Multer/busboy 常把 multipart 里的 UTF-8 中文文件名按 Latin-1 解析，导致乱码。
 * 将错误编码的字符串还原为 UTF-8。
 */
export function fixUploadedFileName(name) {
  if (!name || typeof name !== 'string') return name;

  const looksMojibake = /[\u00c0-\u00ff]/.test(name);
  if (!looksMojibake) return name;

  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  if (decoded.includes('\uFFFD')) return name;

  const cjkBefore = (name.match(/[\u4e00-\u9fff]/g) || []).length;
  const cjkAfter = (decoded.match(/[\u4e00-\u9fff]/g) || []).length;
  if (cjkAfter > cjkBefore) return decoded;

  return name;
}

export function migrateGarbledFileNames(database) {
  const rows = database.prepare('SELECT id, file_name FROM material_files').all();
  const update = database.prepare('UPDATE material_files SET file_name = ? WHERE id = ?');

  for (const row of rows) {
    const fixed = fixUploadedFileName(row.file_name);
    if (fixed !== row.file_name) {
      update.run(fixed, row.id);
    }
  }
}

export function migrateGarbledQuizImportFileNames(database) {
  const table = database
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='quiz_import_files'",
    )
    .get();
  if (!table) return;

  const rows = database
    .prepare('SELECT id, original_name FROM quiz_import_files')
    .all();
  const update = database.prepare(
    'UPDATE quiz_import_files SET original_name = ? WHERE id = ?',
  );

  for (const row of rows) {
    const fixed = fixUploadedFileName(row.original_name);
    if (fixed !== row.original_name) {
      update.run(fixed, row.id);
    }
  }
}
