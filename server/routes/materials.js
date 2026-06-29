import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { getDb, rowToMaterial } from '../db/database.js';
import { authRequired, adminRequired } from '../middleware/auth.js';
import { fixUploadedFileName } from '../lib/filenameEncoding.js';
import { buildKnowledgeContext } from '../lib/buildKnowledgeContext.js';
import { indexAllMaterialFiles, indexMaterialFileById } from '../lib/materialFileIndex.js';
import { loadSettings } from '../settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_ROOT = path.join(__dirname, '../uploads');

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(UPLOAD_ROOT, req.params.id || 'temp');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const original = fixUploadedFileName(file.originalname);
    const ext = path.extname(original).slice(0, 20) || '';
    cb(null, `${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  defParamCharset: 'utf8',
});

function handleUpload(req, res, next) {
  upload.array('files', 20)(req, res, (err) => {
    if (!err) return next();
    console.error('[upload]', err);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: '单个文件不能超过 100MB' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: '一次最多上传 20 个文件' });
    }
    return res.status(400).json({
      error: err.message || '文件上传失败，请检查文件格式与大小后重试',
    });
  });
}

function inferType(fileName, mime) {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return '图片';
  if (mime.startsWith('video/') || ['mp4', 'webm', 'mov'].includes(ext)) return '视频';
  if (mime === 'application/pdf' || ext === 'pdf') return 'PDF';
  if (['doc', 'docx', 'txt', 'md', 'ppt', 'pptx'].includes(ext)) return '文档';
  return '其他';
}

function loadMaterial(db, id) {
  const row = db.prepare('SELECT * FROM materials WHERE id = ?').get(id);
  if (!row) return null;
  const files = db
    .prepare('SELECT * FROM material_files WHERE material_id = ? ORDER BY created_at')
    .all(id);
  return rowToMaterial(row, files);
}

const ORDER_BY_SORT = 'ORDER BY sort_order ASC, created_at ASC';

function listAll(db, { includeHidden = true } = {}) {
  const rows = includeHidden
    ? db.prepare(`SELECT * FROM materials ${ORDER_BY_SORT}`).all()
    : db
        .prepare(`SELECT * FROM materials WHERE hidden = 0 ${ORDER_BY_SORT}`)
        .all();
  return rows.map((row) => {
    const files = db
      .prepare('SELECT * FROM material_files WHERE material_id = ?')
      .all(row.id);
    return rowToMaterial(row, files);
  });
}

function denyUnlessCanAccess(material, req, res) {
  if (!material) {
    res.status(404).json({ error: '资料不存在' });
    return false;
  }
  if (material.hidden && req.user?.role !== 'admin') {
    res.status(404).json({ error: '资料不存在' });
    return false;
  }
  return true;
}

const router = Router();

router.get('/', authRequired, (req, res) => {
  const includeHidden = req.user?.role === 'admin';
  res.json({ materials: listAll(getDb(), { includeHidden }) });
});

router.get('/for-ai', authRequired, (_req, res) => {
  res.json({ materials: listAll(getDb(), { includeHidden: true }) });
});

router.post('/knowledge-context', authRequired, async (req, res) => {
  try {
    const settings = loadSettings();
    if (!settings.features.materialsAiChat || !settings.knowledgeAssistant.enabled) {
      return res.status(403).json({ error: '知识库 AI 助手未启用' });
    }
    const db = getDb();
    const query = typeof req.body?.query === 'string' ? req.body.query : '';
    const includeText =
      settings.knowledgeAssistant.includeTextFileContent !== false;
    const materials = listAll(db, { includeHidden: true });
    const context = await buildKnowledgeContext(db, materials, includeText, query);
    res.json({ context });
  } catch (err) {
    console.error('[knowledge-context]', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : '构建知识库上下文失败',
    });
  }
});

router.post('/index-text', authRequired, adminRequired, async (_req, res) => {
  try {
    const db = getDb();
    const results = await indexAllMaterialFiles(db);
    res.json({ ok: true, indexed: results.length, results });
  } catch (err) {
    console.error('[index-text]', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : '全文索引失败',
    });
  }
});

function applyMaterialsReorder(db, ids) {
  const existing = db.prepare('SELECT id FROM materials ORDER BY sort_order ASC, created_at ASC').all().map((r) => r.id);
  const existingSet = new Set(existing);
  const seen = new Set();
  const ordered = [];
  for (const id of ids) {
    if (typeof id !== 'string' || !existingSet.has(id) || seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  for (const id of existing) {
    if (!seen.has(id)) ordered.push(id);
  }
  if (ordered.length === 0) return null;

  const update = db.prepare('UPDATE materials SET sort_order = ? WHERE id = ?');
  const apply = db.transaction((orderedIds) => {
    orderedIds.forEach((id, index) => update.run(index, id));
  });
  apply(ordered);
  return ordered;
}

const reorderHandler = (req, res) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: '请提供资料 id 顺序列表' });
  }

  const db = getDb();
  if (!applyMaterialsReorder(db, ids)) {
    return res.status(400).json({ error: '请提供资料 id 顺序列表' });
  }

  res.json({ materials: listAll(db, { includeHidden: true }) });
};

router.post('/reorder', authRequired, adminRequired, reorderHandler);
router.put('/reorder', authRequired, adminRequired, reorderHandler);

router.post('/', authRequired, adminRequired, (req, res) => {
  const { title, category, type, description, hidden } = req.body ?? {};
  if (!title?.trim()) return res.status(400).json({ error: '标题不能为空' });

  const id = crypto.randomUUID();
  const db = getDb();
  const maxOrder =
    db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM materials').get()?.m ?? -1;
  db.prepare(
    `INSERT INTO materials (id, title, category, type, description, hidden, sort_order, views, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))`,
  ).run(
    id,
    title.trim(),
    category || '植物识别',
    type || 'PDF',
    description?.trim() || '',
    hidden ? 1 : 0,
    maxOrder + 1,
  );

  res.status(201).json({ material: loadMaterial(db, id) });
});

router.get('/:id', authRequired, (req, res) => {
  const material = loadMaterial(getDb(), req.params.id);
  if (!denyUnlessCanAccess(material, req, res)) return;
  res.json({ material });
});

router.get('/:id/files/:fileId', authRequired, (req, res) => {
  const db = getDb();
  const material = loadMaterial(db, req.params.id);
  if (!denyUnlessCanAccess(material, req, res)) return;

  const file = db
    .prepare('SELECT * FROM material_files WHERE id = ? AND material_id = ?')
    .get(req.params.fileId, req.params.id);
  if (!file) return res.status(404).json({ error: '文件不存在' });

  const abs = path.join(__dirname, '..', file.storage_path);
  if (!fs.existsSync(abs)) return res.status(404).json({ error: '文件已丢失' });

  res.download(abs, file.file_name);
});

router.post('/:id/view', authRequired, (req, res) => {
  const db = getDb();
  const material = loadMaterial(db, req.params.id);
  if (!denyUnlessCanAccess(material, req, res)) return;

  db.prepare(
    `UPDATE materials SET views = views + 1, updated_at = datetime('now') WHERE id = ?`,
  ).run(req.params.id);
  res.json({ material: loadMaterial(db, req.params.id) });
});

router.post('/:id/hidden', authRequired, adminRequired, (req, res) => {
  const db = getDb();
  const existing = loadMaterial(db, req.params.id);
  if (!existing) return res.status(404).json({ error: '资料不存在' });

  const nextHidden =
    req.body?.hidden !== undefined ? (req.body.hidden ? 1 : 0) : existing.hidden ? 0 : 1;

  db.prepare('UPDATE materials SET hidden = ? WHERE id = ?').run(nextHidden, req.params.id);
  res.json({ material: loadMaterial(db, req.params.id) });
});

router.put('/:id', authRequired, adminRequired, (req, res) => {
  const { title, category, type, description, hidden } = req.body ?? {};
  const db = getDb();
  const existing = loadMaterial(db, req.params.id);
  if (!existing) return res.status(404).json({ error: '资料不存在' });

  const nextHidden =
    hidden === undefined || hidden === null ? (existing.hidden ? 1 : 0) : hidden ? 1 : 0;

  db.prepare(
    `UPDATE materials SET title = ?, category = ?, type = ?, description = ?, hidden = ?, updated_at = datetime('now')
     WHERE id = ?`,
  ).run(
    title?.trim() || existing.title,
    category || existing.category,
    type || existing.type,
    description?.trim() ?? existing.description,
    nextHidden,
    req.params.id,
  );

  res.json({ material: loadMaterial(db, req.params.id) });
});

router.delete('/:id', authRequired, adminRequired, (req, res) => {
  const db = getDb();
  const files = db
    .prepare('SELECT storage_path FROM material_files WHERE material_id = ?')
    .all(req.params.id);

  db.prepare('DELETE FROM materials WHERE id = ?').run(req.params.id);

  for (const f of files) {
    const abs = path.join(__dirname, '..', f.storage_path);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  }

  const dir = path.join(UPLOAD_ROOT, req.params.id);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });

  res.json({ ok: true });
});

router.post(
  '/:id/files',
  authRequired,
  adminRequired,
  handleUpload,
  (req, res) => {
    const db = getDb();
    if (!db.prepare('SELECT id FROM materials WHERE id = ?').get(req.params.id)) {
      return res.status(404).json({ error: '资料不存在' });
    }

    const uploaded = req.files ?? [];
    if (uploaded.length === 0) {
      return res.status(400).json({ error: '未收到文件，请重新选择后上传' });
    }
    const insert = db.prepare(`
      INSERT INTO material_files (id, material_id, file_name, file_size, mime_type, file_type, storage_path)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const newFileIds = [];
    for (const f of uploaded) {
      const fileId = crypto.randomUUID();
      const displayName = fixUploadedFileName(f.originalname);
      const rel = path.join('uploads', req.params.id, f.filename);
      insert.run(
        fileId,
        req.params.id,
        displayName,
        f.size,
        f.mimetype || 'application/octet-stream',
        inferType(f.originalname, f.mimetype || ''),
        rel,
      );
      newFileIds.push(fileId);
    }

    db.prepare(`UPDATE materials SET updated_at = datetime('now') WHERE id = ?`).run(req.params.id);
    const material = loadMaterial(db, req.params.id);
    res.json({ material });

    for (const fileId of newFileIds) {
      void indexMaterialFileById(db, fileId).catch((err) => {
        console.warn('[material-index] upload', fileId, err);
      });
    }
  },
);

router.delete('/:id/files/:fileId', authRequired, adminRequired, (req, res) => {
  const db = getDb();
  const file = db
    .prepare('SELECT * FROM material_files WHERE id = ? AND material_id = ?')
    .get(req.params.fileId, req.params.id);
  if (!file) return res.status(404).json({ error: '文件不存在' });

  db.prepare('DELETE FROM material_files WHERE id = ?').run(req.params.fileId);
  const abs = path.join(__dirname, '..', file.storage_path);
  if (fs.existsSync(abs)) fs.unlinkSync(abs);

  res.json({ material: loadMaterial(db, req.params.id) });
});

export default router;
