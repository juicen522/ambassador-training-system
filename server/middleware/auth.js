import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'ambassador-training-dev-secret-change-me';

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, username: user.username },
    JWT_SECRET,
    { expiresIn: '7d' },
  );
}

export function authRequired(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }

  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

export function adminRequired(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  next();
}
