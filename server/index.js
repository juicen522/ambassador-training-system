import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { formatLanUrls } from '../scripts/lanUrls.js';
import { fileURLToPath } from 'url';
import { initDatabase, getDb } from './db/database.js';
import { indexAllMaterialFiles } from './lib/materialFileIndex.js';
import { getAiRuntimeConfig, loadSettings } from './settings.js';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import materialsRoutes from './routes/materials.js';
import settingsRoutes from './routes/settings.js';
import chatRoutes from './routes/chat.js';
import serviceRequestsRoutes from './routes/serviceRequests.js';
import activitiesRoutes from './routes/activities.js';
import quizzesRoutes from './routes/quizzes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

initDatabase();

const app = express();
const PORT = Number(process.env.AI_SERVER_PORT || 3001);
const HOST = process.env.AI_SERVER_HOST || '0.0.0.0';

app.use(cors({ origin: true }));
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (_req, res) => {
  const ai = getAiRuntimeConfig();
  res.json({
    ok: true,
    version: '1.0.0',
    database: 'sqlite',
    aiConfigured: Boolean(ai),
    model: ai?.model || loadSettings().ai.model,
    features: {
      quickLogin: true,
      publicAnswerMode: true,
      materialHiddenToggle: true,
      materialReorder: true,
      serviceRequests: true,
      ambassadorAssignments: true,
      ambassadorRejectAssignment: true,
      ambassadorMyReport: true,
      returnToCreator: true,
      publicNavigation: true,
      adminPendingBadge: true,
      activityManagement: true,
      quizManagement: true,
      quizAiImport: true,
      quizExamReports: true,
    },
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/materials', materialsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/service-requests', serviceRequestsRoutes);
app.use('/api/activities', activitiesRoutes);
app.use('/api/quizzes', quizzesRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || '服务器错误' });
});

app.listen(PORT, HOST, () => {
  console.log(`后端服务: http://localhost:${PORT}`);
  console.log(formatLanUrls(PORT, { label: 'API（开发时由前端代理，一般无需单独访问）' }));
  console.log(`  - 数据库: server/data/app.db`);
  console.log(`  - 文件上传: server/uploads/`);
  const ai = getAiRuntimeConfig();
  console.log(ai ? `  - AI: ${ai.model}` : '  - AI: 未配置（可在配置管理设置）');

  setImmediate(() => {
    const db = getDb();
    indexAllMaterialFiles(db)
      .then((rows) => {
        const ok = rows.filter((r) => r?.status === 'ok').length;
        console.log(`[material-index] 知识库全文索引完成：${ok}/${rows.length} 个文件已解析`);
      })
      .catch((err) => console.warn('[material-index] 后台索引失败', err));
  });
});
