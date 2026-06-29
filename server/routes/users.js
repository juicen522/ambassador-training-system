import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getDb, rowToUser } from '../db/database.js';
import { authRequired, adminRequired } from '../middleware/auth.js';

const router = Router();

const basicTrainingStagesTemplate = [
  { id: 1, name: '大使见面会+讲解演示', duration: '1h', completed: false },
  { id: 2, name: '十如故事+讲解重点', duration: '1h', completed: false },
  { id: 3, name: '知识答题', duration: '30mins', completed: false },
  { id: 4, name: '讲解演练', duration: '1.5h', completed: false },
  { id: 5, name: '讲解考核', duration: '1.5h * 2', completed: false },
];

function defaultProgressJson(role) {
  const stages = basicTrainingStagesTemplate.map((s) => ({ ...s, completed: false }));
  const advanced = role === 'certified' ? 0 : 0;
  return JSON.stringify({
    basicTrainingStages: stages,
    advancedCoursesCompleted: advanced,
    totalAdvancedCourses: 6,
  });
}

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

router.post('/', (req, res) => {
  const username = String(req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '').trim();
  const name = String(req.body?.name ?? '').trim();
  const role = String(req.body?.role ?? 'new');
  const managerIdRaw = req.body?.managerId;

  if (!username || !password || !name) {
    return res.status(400).json({ error: '请填写用户名、密码和姓名' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: '密码至少 6 位' });
  }
  if (!['new', 'certified', 'admin'].includes(role)) {
    return res.status(400).json({ error: '无效的角色' });
  }

  const managerId =
    managerIdRaw == null || managerIdRaw === ''
      ? null
      : String(managerIdRaw).trim();

  const db = getDb();
  const dup = db.prepare('SELECT 1 FROM users WHERE username = ?').get(username);
  if (dup) {
    return res.status(409).json({ error: '用户名已存在' });
  }

  if (managerId) {
    const manager = db.prepare('SELECT id FROM users WHERE id = ?').get(managerId);
    if (!manager) return res.status(400).json({ error: '直属上级不存在' });
  }

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO users (id, username, password_hash, name, role, progress_json, manager_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    username,
    bcrypt.hashSync(password, 10),
    name,
    role,
    defaultProgressJson(role),
    managerId,
  );

  const row = db
    .prepare(
      `SELECT u.*, m.name AS manager_name
       FROM users u
       LEFT JOIN users m ON m.id = u.manager_id
       WHERE u.id = ?`,
    )
    .get(id);

  res.status(201).json({ user: rowToUser(row) });
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
