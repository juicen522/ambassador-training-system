import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { getDb } from '../db/database.js';
import { authRequired, adminRequired } from '../middleware/auth.js';
import { fixUploadedFileName } from '../lib/filenameEncoding.js';
import { normalizeActivityCopywriting } from '../lib/viTypography.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_ROOT = path.join(__dirname, '../uploads/activities');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
    cb(null, UPLOAD_ROOT);
  },
  filename: (_req, file, cb) => {
    const original = fixUploadedFileName(file.originalname);
    const ext = path.extname(original).slice(0, 20) || '';
    cb(null, `${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024, files: 20 },
  defParamCharset: 'utf8',
});

function handleUpload(req, res, next) {
  upload.array('images', 20)(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: '单张图片不能超过 20MB' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: '一次最多上传 20 张图片' });
    }
    return res.status(400).json({ error: err.message || '图片上传失败' });
  });
}

function listActivityImages(db, activityId) {
  const rows = db
    .prepare(
      'SELECT * FROM activity_images WHERE activity_id = ? ORDER BY sort_order ASC, created_at ASC',
    )
    .all(activityId);
  return rows.map((row) => ({
    id: row.id,
    imageName: row.image_name,
    imageUrl: `/api/activities/${activityId}/images/${row.id}`,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
  }));
}

function rowToActivity(db, row) {
  return {
    id: row.id,
    title: row.title,
    theme: row.theme,
    copywriting: row.copywriting,
    status: row.status,
    sortOrder: row.sort_order ?? 0,
    coverImageName: row.cover_image_name ?? null,
    coverImageUrl: row.cover_image_path ? `/api/activities/${row.id}/cover` : null,
    images: listActivityImages(db, row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function syncActivityCoverFromImages(db, activityId) {
  const first = db
    .prepare(
      'SELECT * FROM activity_images WHERE activity_id = ? ORDER BY sort_order ASC, created_at ASC LIMIT 1',
    )
    .get(activityId);
  if (first) {
    db.prepare(
      `UPDATE activities
       SET cover_image_name = ?, cover_image_path = ?, updated_at = datetime('now')
       WHERE id = ?`,
    ).run(first.image_name, first.image_path, activityId);
  } else {
    db.prepare(
      `UPDATE activities
       SET cover_image_name = NULL, cover_image_path = NULL, updated_at = datetime('now')
       WHERE id = ?`,
    ).run(activityId);
  }
}

function listActivities(db, includeDraft = false) {
  const rows = includeDraft
    ? db
        .prepare(
          'SELECT * FROM activities ORDER BY sort_order ASC, created_at DESC',
        )
        .all()
    : db
        .prepare(
          "SELECT * FROM activities WHERE status = 'published' ORDER BY sort_order ASC, created_at DESC",
        )
        .all();
  return rows.map((row) => rowToActivity(db, row));
}

const router = Router();

router.get('/', authRequired, (req, res) => {
  const includeDraft = req.user?.role === 'admin';
  res.json({ activities: listActivities(getDb(), includeDraft) });
});

router.get('/published', authRequired, (req, res) => {
  res.json({ activities: listActivities(getDb(), false) });
});

router.get('/:id', authRequired, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM activities WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '活动不存在' });
  if (row.status !== 'published' && req.user?.role !== 'admin') {
    return res.status(404).json({ error: '活动不存在' });
  }
  res.json({ activity: rowToActivity(db, row) });
});

router.post('/', authRequired, adminRequired, (req, res) => {
  const { title, theme, copywriting, status } = req.body ?? {};
  if (!title?.trim()) {
    return res.status(400).json({ error: '活动标题不能为空' });
  }
  const db = getDb();
  const maxOrder =
    db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM activities').get()
      ?.m ?? -1;
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO activities (id, title, theme, copywriting, status, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
  ).run(
    id,
    title.trim(),
    theme?.trim() || '',
    copywriting !== undefined && copywriting !== null
      ? normalizeActivityCopywriting(String(copywriting))
      : '',
    status === 'published' ? 'published' : 'draft',
    maxOrder + 1,
  );
  const row = db.prepare('SELECT * FROM activities WHERE id = ?').get(id);
  res.status(201).json({ activity: rowToActivity(db, row) });
});

router.put('/:id', authRequired, adminRequired, (req, res) => {
  const db = getDb();
  const old = db.prepare('SELECT * FROM activities WHERE id = ?').get(req.params.id);
  if (!old) return res.status(404).json({ error: '活动不存在' });

  const { title, theme, copywriting, status } = req.body ?? {};
  db.prepare(
    `UPDATE activities
     SET title = ?, theme = ?, copywriting = ?, status = ?, updated_at = datetime('now')
     WHERE id = ?`,
  ).run(
    title?.trim() || old.title,
    theme?.trim() ?? old.theme,
    copywriting !== undefined && copywriting !== null
      ? normalizeActivityCopywriting(String(copywriting))
      : old.copywriting,
    status === 'published' ? 'published' : status === 'draft' ? 'draft' : old.status,
    req.params.id,
  );
  const row = db.prepare('SELECT * FROM activities WHERE id = ?').get(req.params.id);
  res.json({ activity: rowToActivity(db, row) });
});

router.delete('/:id', authRequired, adminRequired, (req, res) => {
  const db = getDb();
  const old = db.prepare('SELECT * FROM activities WHERE id = ?').get(req.params.id);
  if (!old) return res.status(404).json({ error: '活动不存在' });
  db.prepare('DELETE FROM activities WHERE id = ?').run(req.params.id);
  const images = db
    .prepare('SELECT image_path FROM activity_images WHERE activity_id = ?')
    .all(req.params.id);
  if (old.cover_image_path) {
    const abs = path.join(__dirname, '..', old.cover_image_path);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  }
  for (const image of images) {
    const abs = path.join(__dirname, '..', image.image_path);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  }
  res.json({ ok: true });
});

router.post('/:id/images', authRequired, adminRequired, handleUpload, (req, res) => {
  const db = getDb();
  const old = db.prepare('SELECT * FROM activities WHERE id = ?').get(req.params.id);
  if (!old) return res.status(404).json({ error: '活动不存在' });
  const files = req.files ?? [];
  if (files.length === 0) return res.status(400).json({ error: '请至少上传一张图片' });

  const maxOrder =
    db.prepare(
      'SELECT COALESCE(MAX(sort_order), -1) AS m FROM activity_images WHERE activity_id = ?',
    ).get(req.params.id)?.m ?? -1;
  const insert = db.prepare(
    `INSERT INTO activity_images (id, activity_id, image_name, image_path, sort_order)
     VALUES (?, ?, ?, ?, ?)`,
  );

  files.forEach((file, index) => {
    const rel = path.join('uploads', 'activities', file.filename);
    insert.run(
      crypto.randomUUID(),
      req.params.id,
      fixUploadedFileName(file.originalname),
      rel,
      maxOrder + 1 + index,
    );
  });

  if (!old.cover_image_path) {
    const first = files[0];
    const rel = path.join('uploads', 'activities', first.filename);
    db.prepare(
      `UPDATE activities
       SET cover_image_name = ?, cover_image_path = ?, updated_at = datetime('now')
       WHERE id = ?`,
    ).run(fixUploadedFileName(first.originalname), rel, req.params.id);
  } else {
    db.prepare(
      `UPDATE activities SET updated_at = datetime('now') WHERE id = ?`,
    ).run(req.params.id);
  }

  const row = db.prepare('SELECT * FROM activities WHERE id = ?').get(req.params.id);
  res.json({ activity: rowToActivity(db, row) });
});

router.get('/:id/images/:imageId', (req, res) => {
  const db = getDb();
  const row = db
    .prepare('SELECT image_path FROM activity_images WHERE id = ? AND activity_id = ?')
    .get(req.params.imageId, req.params.id);
  if (!row?.image_path) return res.status(404).json({ error: '图片不存在' });
  const abs = path.join(__dirname, '..', row.image_path);
  if (!fs.existsSync(abs)) return res.status(404).json({ error: '图片已丢失' });
  res.sendFile(abs);
});

router.delete('/:id/images/:imageId', authRequired, adminRequired, (req, res) => {
  const db = getDb();
  const image = db
    .prepare('SELECT * FROM activity_images WHERE id = ? AND activity_id = ?')
    .get(req.params.imageId, req.params.id);
  if (!image) return res.status(404).json({ error: '图片不存在' });

  if (image.image_path) {
    const abs = path.join(__dirname, '..', image.image_path);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  }
  db.prepare('DELETE FROM activity_images WHERE id = ?').run(req.params.imageId);

  syncActivityCoverFromImages(db, req.params.id);

  const row = db.prepare('SELECT * FROM activities WHERE id = ?').get(req.params.id);
  res.json({ activity: rowToActivity(db, row) });
});

router.post('/:id/images/reorder', authRequired, adminRequired, (req, res) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: '请提供图片 id 顺序列表' });
  }
  const db = getDb();
  const activity = db.prepare('SELECT id FROM activities WHERE id = ?').get(req.params.id);
  if (!activity) return res.status(404).json({ error: '活动不存在' });

  const existing = db
    .prepare(
      'SELECT id FROM activity_images WHERE activity_id = ? ORDER BY sort_order ASC, created_at ASC',
    )
    .all(req.params.id)
    .map((r) => r.id);
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

  const update = db.prepare(
    'UPDATE activity_images SET sort_order = ? WHERE id = ? AND activity_id = ?',
  );
  const apply = db.transaction((orderedIds) => {
    orderedIds.forEach((imageId, index) =>
      update.run(index, imageId, req.params.id),
    );
  });
  apply(ordered);

  syncActivityCoverFromImages(db, req.params.id);
  db.prepare(`UPDATE activities SET updated_at = datetime('now') WHERE id = ?`).run(
    req.params.id,
  );

  const row = db.prepare('SELECT * FROM activities WHERE id = ?').get(req.params.id);
  res.json({ activity: rowToActivity(db, row) });
});

router.get('/:id/cover', (req, res) => {
  const db = getDb();
  const row = db
    .prepare('SELECT cover_image_path, cover_image_name FROM activities WHERE id = ?')
    .get(req.params.id);
  if (!row?.cover_image_path) return res.status(404).json({ error: '图片不存在' });
  const abs = path.join(__dirname, '..', row.cover_image_path);
  if (!fs.existsSync(abs)) return res.status(404).json({ error: '图片已丢失' });
  res.sendFile(abs);
});

router.post('/reorder', authRequired, adminRequired, (req, res) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: '请提供活动 id 顺序列表' });
  }
  const db = getDb();
  const existing = db
    .prepare('SELECT id FROM activities ORDER BY sort_order ASC, created_at ASC')
    .all()
    .map((r) => r.id);
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
  const update = db.prepare('UPDATE activities SET sort_order = ? WHERE id = ?');
  const apply = db.transaction((orderedIds) => {
    orderedIds.forEach((id, index) => update.run(index, id));
  });
  apply(ordered);
  res.json({ activities: listActivities(db, true) });
});

export default router;
