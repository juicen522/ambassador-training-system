import { Router } from 'express';
import { getDb, rowToUser } from '../db/database.js';
import { authRequired, adminRequired } from '../middleware/auth.js';

const router = Router();

router.use(authRequired, adminRequired);

router.get('/', (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT u.*, m.name AS manager_name
       FROM users u
       LEFT JOIN users m ON m.id = u.manager_id
       ORDER BY u.name`,
    )
    .all();
  res.json({ users: rows.map(rowToUser) });
});

router.patch('/:id/manager', (req, res) => {
  const db = getDb();
  const userId = String(req.params.id ?? '').trim();
  const managerIdRaw = req.body?.managerId;
  const managerId =
    managerIdRaw == null || managerIdRaw === ''
      ? null
      : String(managerIdRaw).trim();

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: '员工不存在' });

  if (managerId === userId) {
    return res.status(400).json({ error: '直属上级不能是本人' });
  }
  if (managerId) {
    const manager = db.prepare('SELECT id FROM users WHERE id = ?').get(managerId);
    if (!manager) return res.status(400).json({ error: '直属上级不存在' });
  }

  db.prepare('UPDATE users SET manager_id = ? WHERE id = ?').run(managerId, userId);

  const row = db
    .prepare(
      `SELECT u.*, m.name AS manager_name
       FROM users u
       LEFT JOIN users m ON m.id = u.manager_id
       WHERE u.id = ?`,
    )
    .get(userId);
  res.json({ user: rowToUser(row) });
});

export default router;
