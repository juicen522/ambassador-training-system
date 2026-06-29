import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isProductionMode } from './lib/appMode.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_DIR = path.join(__dirname, 'data');
const SETTINGS_PATH = path.join(SETTINGS_DIR, 'settings.json');

export const DEFAULT_SETTINGS = {
  ai: {
    apiKey: '',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    temperature: 0.3,
    maxTokens: 2048,
    enabled: true,
  },
  system: {
    siteName: '园林大使培训系统',
    organizationName: '',
    supportContact: '',
  },
  knowledgeAssistant: {
    enabled: true,
    /** strict=仅根据资料；flexible=以资料为主，可补充常识说明 */
    answerMode: 'strict',
    welcomeMessage:
      '你好！我是基于本系统知识库的 AI 助手，回答内容仅来自已上传的培训资料。有什么想了解的吗？',
    flexibleWelcomeMessage:
      '你好！我以知识库内容为主回答，必要时也会用通用知识帮你解释清楚。具体路线与专有名称仍以知识库为准。',
    maxHistoryTurns: 10,
    includeTextFileContent: true,
    answerStyleGuide: `【回答格式】
- 用户问参观路线、游览顺序、线路图、「怎么走」「经过哪些点」时：用游览顺序链式呈现，例如：声白 ➡️ 香山园 ➡️ 精思苑 ➡️ …（站点名须与知识库资料一致）。
- 不要默认展开为「1. 某点：长篇介绍 2. 某点：长篇介绍」的编号清单。
- 先给路线主线（一行或简短多行）；仅当用户明确要求「详细介绍」「逐点讲解」「每站说什么」时，再分点补充说明。
- 默认简洁，便于讲解员带路，避免复述整篇讲解稿。`,
  },
  features: {
    materialsAiChat: true,
    weeklyTest: true,
    knowledgeTest: true,
    showQuickLogin: true,
  },
  navigation: {
    dashboard: {
      menuLabel: '首页',
      pageTitle: '欢迎回来',
      pageDescription: '继续你的学习之旅',
    },
    materials: {
      menuLabel: '知识库',
      pageTitle: '培训资料库',
      pageDescription: '浏览和学习园林大使必备知识（点击卡片可打开已上传的文件）',
    },
    training: {
      menuLabel: '培训中心',
      overview: {
        menuLabel: '学习进度',
        pageTitle: '我的学习进度',
        pageDescription: '全面了解你的培训完成情况',
      },
      basic: {
        menuLabel: '基础培训',
        pageTitle: '基础培训',
        pageDescription: '按顺序完成5个阶段，全面掌握讲解技能',
      },
      advanced: {
        menuLabel: '进阶培训',
        pageTitle: '进阶培训',
        pageDescription: '深化专业知识，提升讲解技能',
      },
    },
    admin: {
      menuLabel: '培训管理',
      pageTitle: '培训管理',
      pageDescription: '管理大使、知识库、培训内容与系统配置',
      tabs: {
        users: '大使管理',
        materials: '知识库管理',
        training: '培训内容管理',
        settings: '配置管理',
      },
    },
    approvalFlow: {
      menuLabel: '审批流',
      pageTitle: '审批流',
      pageDescription: '集中查看和处理待审批事项，后续可在此接入完整审批流程。',
    },
    ambassadorServices: {
      menuLabel: '大使服务',
      pageTitle: '大使服务',
      pageDescription: '派单处理讲解需求；大使填报实际参观时长后，在此统计积分与排行',
      requests: {
        menuLabel: '需求处理',
        pageTitle: '需求处理',
        pageDescription: '',
      },
      visits: {
        menuLabel: '参观与积分',
        pageTitle: '参观与积分',
        pageDescription: '',
      },
    },
    service: {
      demandsGroupLabel: '大使需求',
      workGroupLabel: '讲解服务',
      newRequest: {
        menuLabel: '发起大使需求',
        pageTitle: '发起大使需求',
        pageDescription:
          '需求部门填写并提交后，由管理员派单给指定大使；参观结束后大使填报实际时长，系统据此统计积分。',
      },
      applications: {
        menuLabel: '我的申请单',
        pageTitle: '我的申请单',
        pageDescription: '查看您提交的需求及处理进度；被退回的需求可修改后重新提交。',
        backLinkLabel: '返回我的申请单',
        emptyListHint: '暂无申请记录，请点击「发起大使需求」填写表单。',
      },
      tasks: {
        menuLabel: '我的讲解任务',
        pageTitle: '我的讲解任务',
        pageDescription:
          '查看管理员派给您的讲解任务，接受或拒绝派单；参观结束后填报实际讲解时长。',
      },
      report: {
        menuLabel: '我的服务报表',
        pageTitle: '我的服务报表',
        pageDescription: '汇总您的讲解积分、服务时长及每次参观记录。',
      },
    },
  },
};

function deepMerge(base, patch) {
  const result = { ...base };
  const keys = new Set([...Object.keys(base), ...Object.keys(patch)]);
  for (const key of keys) {
    const baseVal = base[key];
    const patchVal = patch[key];
    if (
      baseVal &&
      typeof baseVal === 'object' &&
      !Array.isArray(baseVal) &&
      patchVal &&
      typeof patchVal === 'object' &&
      !Array.isArray(patchVal)
    ) {
      result[key] = deepMerge(baseVal, patchVal);
    } else if (patchVal !== undefined) {
      result[key] = patchVal;
    } else {
      result[key] = baseVal;
    }
  }
  return result;
}

function sanitizeSettingsPatch(patch) {
  const next = structuredClone(patch);
  if (next.ai) {
    delete next.ai.apiKeyConfigured;
    delete next.ai.apiKeyPreview;
  }
  return next;
}

function readFileSettings() {
  if (!fs.existsSync(SETTINGS_PATH)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function applyEnvFallback(settings) {
  const next = structuredClone(settings);
  if (!next.ai.apiKey && process.env.AI_API_KEY) {
    next.ai.apiKey = process.env.AI_API_KEY;
  }
  if (process.env.AI_BASE_URL && !readFileSettings().ai?.baseUrl) {
    next.ai.baseUrl = process.env.AI_BASE_URL;
  }
  if (process.env.AI_MODEL && !readFileSettings().ai?.model) {
    next.ai.model = process.env.AI_MODEL;
  }
  return next;
}

export function loadSettings() {
  const merged = deepMerge(DEFAULT_SETTINGS, readFileSettings());
  if (isProductionMode() && merged.features.showQuickLogin && !readFileSettings().features) {
    merged.features.showQuickLogin = false;
  }
  return applyEnvFallback(merged);
}

/** 生产环境：首次写入 settings.json，关闭快捷登录 */
export function ensureProductionSettingsDefaults() {
  if (!isProductionMode() || fs.existsSync(SETTINGS_PATH)) return;

  const initial = structuredClone(DEFAULT_SETTINGS);
  initial.features.showQuickLogin = false;
  fs.mkdirSync(SETTINGS_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(initial, null, 2), 'utf8');
  console.log('[settings] 已初始化生产环境配置（已关闭快捷登录）');
}

/** @returns {'strict' | 'flexible'} */
export function resolveAnswerMode(ka = {}) {
  if (ka.answerMode === 'flexible' || ka.answerMode === 'strict') {
    return ka.answerMode;
  }
  if (ka.useKnowledgeBase === false) return 'flexible';
  return 'strict';
}

export function saveSettings(patch) {
  const current = loadSettings();
  const clean = sanitizeSettingsPatch(patch);

  if (clean.ai) {
    if (!('apiKey' in clean.ai) || clean.ai.apiKey === '') {
      clean.ai = { ...clean.ai, apiKey: current.ai.apiKey };
    }
  }

  const next = deepMerge(current, clean);
  fs.mkdirSync(SETTINGS_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

export function maskApiKey(key) {
  if (!key || key.length < 8) return '';
  return `${key.slice(0, 3)}***${key.slice(-4)}`;
}

export function toAdminSettingsView(settings) {
  return {
    ai: {
      ...settings.ai,
      apiKey: '',
      apiKeyConfigured: Boolean(settings.ai.apiKey),
      apiKeyPreview: maskApiKey(settings.ai.apiKey),
    },
    system: { ...settings.system },
    knowledgeAssistant: { ...settings.knowledgeAssistant },
    features: { ...settings.features },
    navigation: structuredClone(settings.navigation),
  };
}

export function toPublicSettings(settings) {
  return {
    system: {
      siteName: settings.system.siteName,
      organizationName: settings.system.organizationName,
    },
    knowledgeAssistant: {
      enabled: settings.knowledgeAssistant.enabled && settings.ai.enabled,
      answerMode: resolveAnswerMode(settings.knowledgeAssistant),
      welcomeMessage: settings.knowledgeAssistant.welcomeMessage,
      flexibleWelcomeMessage: settings.knowledgeAssistant.flexibleWelcomeMessage,
      maxHistoryTurns: settings.knowledgeAssistant.maxHistoryTurns,
      includeTextFileContent: settings.knowledgeAssistant.includeTextFileContent,
    },
    features: { ...settings.features },
    navigation: structuredClone(
      settings.navigation ?? DEFAULT_SETTINGS.navigation,
    ),
    aiConfigured: Boolean(settings.ai.apiKey) && settings.ai.enabled,
  };
}

export function getAiRuntimeConfig() {
  const settings = loadSettings();
  if (!settings.ai.enabled || !settings.ai.apiKey) {
    return null;
  }
  return {
    apiKey: settings.ai.apiKey,
    baseUrl: (settings.ai.baseUrl || 'https://api.deepseek.com/v1').replace(/\/$/, ''),
    model: settings.ai.model || 'deepseek-chat',
    temperature: settings.ai.temperature ?? 0.3,
    maxTokens: settings.ai.maxTokens ?? 2048,
  };
}

function formatAiError(status, bodyText) {
  try {
    const json = JSON.parse(bodyText);
    const msg =
      json.error?.message ||
      json.message ||
      (typeof json.error === 'string' ? json.error : null);
    if (msg) return msg;
  } catch {
    /* ignore */
  }
  if (status === 401) return 'API Key 无效或已过期，请到 DeepSeek 控制台核对密钥';
  if (status === 402) return '账户余额不足，请在 DeepSeek 控制台充值后再试';
  if (status === 429) return '请求过于频繁，请稍后再试';
  return `连接失败（HTTP ${status}）`;
}

export async function testAiConnection(override) {
  const saved = loadSettings().ai;
  const apiKey = String(override?.apiKey || saved.apiKey || '').trim();

  if (!apiKey) {
    return {
      ok: false,
      message: '请先在上方「API Key」输入框粘贴 DeepSeek 密钥，再点测试（或先保存再测试）',
    };
  }

  const config = {
    apiKey,
    baseUrl: (override?.baseUrl || saved.baseUrl || 'https://api.deepseek.com/v1').replace(/\/$/, ''),
    model: override?.model || saved.model || 'deepseek-chat',
    temperature: 0.3,
    maxTokens: 64,
  };

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: '回复 OK' }],
        max_tokens: 16,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        ok: false,
        message: formatAiError(response.status, text),
        detail: text.slice(0, 300),
        status: response.status,
      };
    }

    return { ok: true, message: '连接成功', model: config.model };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      message: `无法访问 ${config.baseUrl}：${msg}（请检查网络或 Base URL 是否为 https://api.deepseek.com/v1）`,
    };
  }
}
