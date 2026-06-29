import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { getDb, rowToUser } from '../db/database.js';
import { signToken, authRequired } from '../middleware/auth.js';

const router = Router();

router.post('/quick-login', (req, res) => {
  const { username } = req.body ?? {};
  if (!username) {
    return res.status(400).json({ error: '请选择登录身份' });
  }

  const db = getDb();
  const row = db
    .prepare('SELECT * FROM users WHERE username = ?')
    .get(String(username).trim());

  if (!row) {
    return res.status(404).json({ error: '用户不存在' });
  }

  const user = rowToUser(row);
  const token = signToken({ id: user.id, role: user.role, username: row.username });
  res.json({ token, user });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    return res.status(400).json({ error: '请输入用户名和密码' });
  }

  const db = getDb();
  const row = db
    .prepare('SELECT * FROM users WHERE username = ?')
    .get(String(username).trim());

  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const user = rowToUser(row);
  const token = signToken({ id: user.id, role: user.role, username: row.username });

  res.json({ token, user });
});

router.get('/me', authRequired, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.sub);
  if (!row) {
    return res.status(404).json({ error: '用户不存在' });
  }
  res.json({ user: rowToUser(row) });
});

export default router;
