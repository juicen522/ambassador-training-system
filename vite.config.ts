import { defineConfig, type Plugin } from 'vite';
import path from 'path';
import { spawn, execSync, type ChildProcess } from 'child_process';
import { fileURLToPath } from 'url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { formatLanUrls } from './scripts/lanUrls.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_PORT = Number(process.env.AI_SERVER_PORT || 3001);
const dockerBuild = process.env.VITE_DOCKER_BUILD === '1';

function apiServerPlugin(): Plugin {
  let proc: ChildProcess | null = null;

  return {
    name: 'api-server',
    async configureServer() {
      if (process.env.SKIP_API_SERVER === '1') {
        return;
      }

      const isBackendCurrent = async (): Promise<boolean> => {
        try {
          const healthRes = await fetch(`http://127.0.0.1:${API_PORT}/api/health`);
          if (!healthRes.ok) return false;
          const health = (await healthRes.json()) as {
            features?: {
              quickLogin?: boolean;
              publicAnswerMode?: boolean;
              materialHiddenToggle?: boolean;
              materialReorder?: boolean;
              serviceRequests?: boolean;
              ambassadorAssignments?: boolean;
              ambassadorRejectAssignment?: boolean;
              ambassadorMyReport?: boolean;
              returnToCreator?: boolean;
              publicNavigation?: boolean;
              adminPendingBadge?: boolean;
              activityManagement?: boolean;
              quizExamReports?: boolean;
            };
          };
          if (
            !health.features?.quickLogin ||
            !health.features?.publicAnswerMode ||
            !health.features?.materialHiddenToggle ||
            !health.features?.materialReorder ||
            !health.features?.serviceRequests ||
            !health.features?.ambassadorAssignments ||
            !health.features?.ambassadorRejectAssignment ||
            !health.features?.ambassadorMyReport ||
            !health.features?.returnToCreator ||
            !health.features?.publicNavigation ||
            !health.features?.adminPendingBadge ||
            !health.features?.activityManagement ||
            !health.features?.quizExamReports
          ) {
            return false;
          }
          const quizReports = await fetch(
            `http://127.0.0.1:${API_PORT}/api/quizzes/admin/reports?type=weekly`,
            { headers: { Authorization: 'Bearer probe' } },
          );
          if (quizReports.status === 404) {
            const probeText = await quizReports.text();
            if (probeText.includes('Cannot GET')) return false;
          }
          const assignmentsMine = await fetch(
            `http://127.0.0.1:${API_PORT}/api/service-requests/assignments/mine`,
            { headers: { Authorization: 'Bearer probe' } },
          );
          if (assignmentsMine.status === 404) return false;
          const ambassadorReport = await fetch(
            `http://127.0.0.1:${API_PORT}/api/service-requests/assignments/mine/report`,
            { headers: { Authorization: 'Bearer probe' } },
          );
          if (ambassadorReport.status === 404) return false;
          const returnToCreator = await fetch(
            `http://127.0.0.1:${API_PORT}/api/service-requests/probe/return-to-creator`,
            {
              method: 'PATCH',
              headers: { Authorization: 'Bearer probe', 'Content-Type': 'application/json' },
              body: '{}',
            },
          );
          if (returnToCreator.status === 404) {
            const probeText = await returnToCreator.text();
            if (probeText.includes('Cannot PATCH')) return false;
          }
          const adminList = await fetch(
            `http://127.0.0.1:${API_PORT}/api/service-requests/admin/list`,
            { headers: { Authorization: 'Bearer probe' } },
          );
          if (adminList.status === 404) return false;
          const adminPendingBadge = await fetch(
            `http://127.0.0.1:${API_PORT}/api/service-requests/admin/pending-badge`,
            { headers: { Authorization: 'Bearer probe' } },
          );
          if (adminPendingBadge.status === 404) return false;
          const activitiesPublished = await fetch(
            `http://127.0.0.1:${API_PORT}/api/activities/published`,
            { headers: { Authorization: 'Bearer probe' } },
          );
          if (activitiesPublished.status === 404) {
            const probeText = await activitiesPublished.text();
            if (probeText.includes('Cannot GET')) return false;
          }
          const pubRes = await fetch(`http://127.0.0.1:${API_PORT}/api/settings/public`);
          if (!pubRes.ok) return false;
          const pub = (await pubRes.json()) as {
            knowledgeAssistant?: { answerMode?: string };
            navigation?: { dashboard?: { menuLabel?: string } };
          };
          return (
            (pub.knowledgeAssistant?.answerMode === 'strict' ||
              pub.knowledgeAssistant?.answerMode === 'flexible') &&
            Boolean(pub.navigation?.dashboard?.menuLabel)
          );
        } catch {
          return false;
        }
      };

      if (await isBackendCurrent()) {
        console.log(`[api-server] 端口 ${API_PORT} 已有服务，跳过启动`);
        return;
      }

      try {
        const staleRes = await fetch(`http://127.0.0.1:${API_PORT}/api/health`);
        if (staleRes.ok) {
          console.warn(`[api-server] 端口 ${API_PORT} 为旧版后端，正在重启…`);
          try {
            execSync(`lsof -ti :${API_PORT} | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore' });
          } catch {
            /* ignore */
          }
          await new Promise((r) => setTimeout(r, 400));
        }
      } catch {
        // 未运行，下面自动启动
      }

      const serverPath = path.resolve(__dirname, 'server/index.js');
      proc = spawn(process.execPath, [serverPath], {
        cwd: __dirname,
        stdio: 'inherit',
        env: { ...process.env },
      });

      proc.on('error', (err) => {
        console.error('[api-server] 启动失败:', err.message);
      });

      // 等待服务就绪
      for (let i = 0; i < 30; i++) {
        try {
          const res = await fetch(`http://127.0.0.1:${API_PORT}/api/health`);
          if (res.ok) {
            console.log(`[api-server] 配置与 AI 服务: http://127.0.0.1:${API_PORT}`);
            return;
          }
        } catch {
          await new Promise((r) => setTimeout(r, 200));
        }
      }
      console.warn('[api-server] 启动超时，配置管理可能无法连接');
    },
    closeBundle() {
      if (proc && !proc.killed) {
        proc.kill('SIGTERM');
        proc = null;
      }
    },
  };
}

function lanAccessPlugin(port: number): Plugin {
  return {
    name: 'lan-access-hint',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        console.log(formatLanUrls(port, { label: '访问地址' }));
        console.log('  提示：请用手机/同事电脑浏览器打开上方地址，勿使用 localhost');
      });
    },
    configurePreviewServer(server) {
      server.httpServer?.once('listening', () => {
        console.log(formatLanUrls(port, { label: '预览地址' }));
      });
    },
  };
}

export default defineConfig({
  plugins: [
    ...(dockerBuild ? [] : [apiServerPlugin(), lanAccessPlugin(5181)]),
    react(),
    tailwindcss(),
  ],
  build: dockerBuild
    ? {
        // 小内存服务器上降低并行度，避免构建看似卡死或 OOM
        rollupOptions: {
          maxParallelFileOps: 2,
        },
      }
    : undefined,
  server: {
    host: '0.0.0.0',
    port: 5181,
    strictPort: true,
    hmr: {
      clientPort: 5181,
    },
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: true,
        timeout: 300_000,
        proxyTimeout: 300_000,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5181,
    strictPort: true,
    hmr: {
      clientPort: 5181,
    },
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: true,
        timeout: 300_000,
        proxyTimeout: 300_000,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  assetsInclude: ['**/*.svg', '**/*.csv'],
});
