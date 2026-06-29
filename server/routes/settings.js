import { Router } from 'express';
import {
  loadSettings,
  saveSettings,
  toAdminSettingsView,
  toPublicSettings,
  testAiConnection,
} from '../settings.js';
import { authRequired, adminRequired } from '../middleware/auth.js';

const router = Router();

router.get('/public', (_req, res) => {
  res.json(toPublicSettings(loadSettings()));
});

router.get('/', authRequired, adminRequired, (_req, res) => {
  res.json(toAdminSettingsView(loadSettings()));
});

router.put('/', authRequired, adminRequired, (req, res) => {
  try {
    const saved = saveSettings(req.body ?? {});
    res.json(toAdminSettingsView(saved));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : '保存失败' });
  }
});

router.post('/test-ai', authRequired, adminRequired, async (req, res) => {
  try {
    const result = await testAiConnection(req.body?.ai?.apiKey ? req.body.ai : null);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, message: err instanceof Error ? err.message : '测试失败' });
  }
});

export default router;
