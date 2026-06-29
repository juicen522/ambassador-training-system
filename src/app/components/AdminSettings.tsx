import { useEffect, useState } from 'react';
import {
  Settings,
  Bot,
  Building2,
  Sparkles,
  ToggleLeft,
  Save,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { fetchAdminSettings, saveAdminSettings, testAiSettings } from '../lib/settingsApi';
import { useSettings } from '../contexts/SettingsContext';
import NavigationCopyEditor from './NavigationCopyEditor';
import type { AppSettings } from '../types/settings';
import { mergeNavigation } from '../lib/mergeNavigation';
import { AI_PROVIDER_PRESETS, DEFAULT_NAVIGATION } from '../types/settings';

const inputStyle = {
  borderColor: 'rgba(56, 44, 37, 0.15)',
  color: '#382C25',
};

function SectionCard({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description?: string;
  icon: typeof Settings;
  children: React.ReactNode;
}) {
  return (
    <div
      className="bg-white rounded-lg border p-6 mb-6"
      style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
    >
      <div className="flex items-start gap-3 mb-5">
        <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(94, 196, 182, 0.1)' }}>
          <Icon className="w-5 h-5" style={{ color: '#5EC4B6' }} />
        </div>
        <div>
          <h3 className="text-base font-medium" style={{ color: '#382C25' }}>
            {title}
          </h3>
          {description && (
            <p className="text-xs mt-1" style={{ color: '#7A6E68' }}>
              {description}
            </p>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between py-3 border-b last:border-0 cursor-pointer" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
      <div className="pr-4">
        <span className="text-sm block" style={{ color: '#382C25' }}>
          {label}
        </span>
        {description && (
          <span className="text-xs" style={{ color: '#7A6E68' }}>
            {description}
          </span>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative w-11 h-6 rounded-full transition-colors shrink-0"
        style={{ backgroundColor: checked ? '#5EC4B6' : '#E0E0E0' }}
      >
        <span
          className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform"
          style={{ left: checked ? '22px' : '2px' }}
        />
      </button>
    </label>
  );
}

type SettingsTab = 'system' | 'ai';

const SETTINGS_TABS: Array<{
  id: SettingsTab;
  label: string;
  icon: typeof Settings;
  hint: string;
}> = [
  {
    id: 'system',
    label: '系统配置',
    icon: Settings,
    hint: '系统名称、导航文案、模块开关等',
  },
  {
    id: 'ai',
    label: 'AI 管理',
    icon: Bot,
    hint: 'AI 接口、知识库助手与相关功能',
  },
];

export default function AdminSettings({ pageTitle = '配置管理' }: { pageTitle?: string }) {
  const { refresh: refreshPublic, applyNavigation } = useSettings();
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('system');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [newApiKey, setNewApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; detail?: string } | null>(null);
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState('');
  const [providerId, setProviderId] = useState('deepseek');

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await fetchAdminSettings();
      setSettings(data);
      const matched = AI_PROVIDER_PRESETS.find((p) => p.baseUrl === data.ai.baseUrl);
      if (matched) setProviderId(matched.id);
    } catch (err) {
      setSettings(null);
      setLoadError(
        err instanceof Error ? err.message : '无法连接配置服务',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const update = <K extends keyof AppSettings>(
    section: K,
    patch: Partial<AppSettings[K]>,
  ) => {
    if (!settings) return;
    setSettings({ ...settings, [section]: { ...settings[section], ...patch } });
  };

  const navigation = mergeNavigation(settings?.navigation);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setMessage('');
    try {
      const payload: AppSettings = {
        ...settings,
        navigation: mergeNavigation(settings.navigation),
        ai: {
          ...settings.ai,
          ...(newApiKey.trim() ? { apiKey: newApiKey.trim() } : {}),
        },
      };
      const saved = await saveAdminSettings(payload);
      const mergedNav = mergeNavigation(saved.navigation);
      setSettings({
        ...saved,
        navigation: mergedNav,
      });
      applyNavigation(mergedNav);
      setNewApiKey('');
      setMessage('配置已保存，全站菜单与页面文案已同步');
      try {
        await refreshPublic();
      } catch {
        /* 保存成功；若公开接口为旧后端，applyNavigation 已生效 */
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleTestAi = async () => {
    if (!settings) return;
    setTesting(true);
    setTestResult(null);
    setMessage('');
    try {
      const result = await testAiSettings(
        newApiKey.trim()
          ? {
              apiKey: newApiKey.trim(),
              baseUrl: settings.ai.baseUrl,
              model: settings.ai.model,
            }
          : undefined,
      );
      setTestResult(result);

      if (result.ok && newApiKey.trim()) {
        const saved = await saveAdminSettings({
          ...settings,
          ai: { ...settings.ai, apiKey: newApiKey.trim() },
        });
        setSettings(saved);
        setNewApiKey('');
        setTestResult({ ok: true, message: '连接成功，API Key 已自动保存，知识库 AI 现已可用' });
        setMessage('配置已保存');
        await refreshPublic();
      } else if (result.ok) {
        await refreshPublic();
      }
    } catch {
      setTestResult({ ok: false, message: '测试请求失败' });
    } finally {
      setTesting(false);
    }
  };

  const applyPreset = (id: string) => {
    const preset = AI_PROVIDER_PRESETS.find((p) => p.id === id);
    if (!preset || !settings) return;
    setProviderId(id);
    update('ai', { baseUrl: preset.baseUrl, model: preset.models[0] });
  };

  if (loading) {
    return (
      <p className="text-sm py-12 text-center" style={{ color: '#7A6E68' }}>
        加载配置中…
      </p>
    );
  }

  if (!settings) {
    return (
      <div
        className="py-10 px-6 rounded-lg border text-center max-w-lg mx-auto"
        style={{ borderColor: 'rgba(56, 44, 37, 0.08)', backgroundColor: '#FAFAFA' }}
      >
        <p className="text-base font-medium mb-2" style={{ color: '#382C25' }}>
          无法连接配置服务
        </p>
        <p className="text-sm mb-4" style={{ color: '#7A6E68' }}>
          配置接口依赖本机后端（默认端口 3001）。请确认开发服务已启动。
        </p>
        {loadError && (
          <p className="text-xs mb-4 px-3 py-2 rounded" style={{ color: '#E85D75', backgroundColor: 'rgba(232,93,117,0.08)' }}>
            {loadError}
          </p>
        )}
        <div
          className="text-left text-xs mb-6 px-4 py-3 rounded-lg space-y-1"
          style={{ backgroundColor: 'white', color: '#7A6E68' }}
        >
          <p className="font-medium" style={{ color: '#382C25' }}>请尝试：</p>
          <p>1. 停止当前终端里的 dev，重新执行 <code className="px-1">npm run dev</code>（会自动启动配置服务）</p>
          <p>2. 或另开终端执行 <code className="px-1">npm run dev:server</code> 后点击重试</p>
        </div>
        <button
          type="button"
          onClick={load}
          className="px-4 py-2 rounded-lg text-sm text-white"
          style={{ backgroundColor: '#5EC4B6' }}
        >
          重试
        </button>
      </div>
    );
  }

  const currentPreset = AI_PROVIDER_PRESETS.find((p) => p.id === providerId);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-medium" style={{ color: '#382C25' }}>
            {pageTitle}
          </h2>
          <p className="text-xs mt-1" style={{ color: '#7A6E68' }}>
            {settingsTab === 'ai'
              ? 'AI 相关配置保存在本机 server/data/settings.json，API Key 不会暴露给浏览器用户'
              : '系统名称、导航文案与功能开关保存在本机 server/data/settings.json'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={load}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm"
            style={{ borderColor: 'rgba(56, 44, 37, 0.15)', color: '#7A6E68' }}
          >
            <RefreshCw className="w-4 h-4" />
            刷新
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-white disabled:opacity-60"
            style={{ backgroundColor: '#5EC4B6' }}
          >
            <Save className="w-4 h-4" />
            {saving ? '保存中…' : '保存全部'}
          </button>
        </div>
      </div>

      {message && (
        <p
          className="text-sm mb-4 px-4 py-2 rounded-lg"
          style={{
            backgroundColor: message.includes('失败') ? 'rgba(232, 93, 117, 0.1)' : 'rgba(94, 196, 182, 0.1)',
            color: message.includes('失败') ? '#E85D75' : '#5EC4B6',
          }}
        >
          {message}
        </p>
      )}

      <div
        className="flex flex-wrap gap-2 mb-6 p-1 rounded-lg border bg-white"
        style={{ borderColor: 'rgba(56, 44, 37, 0.08)' }}
      >
        {SETTINGS_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = settingsTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSettingsTab(tab.id)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm transition-all"
              style={{
                backgroundColor: active ? '#5EC4B6' : 'transparent',
                color: active ? 'white' : '#7A6E68',
              }}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <p className="text-xs mb-6 -mt-3" style={{ color: '#7A6E68' }}>
        {SETTINGS_TABS.find((t) => t.id === settingsTab)?.hint}
      </p>

      {settingsTab === 'ai' && (
      <>
      <SectionCard
        title="AI 接口配置"
        description="用于知识库 AI 助手，支持 OpenAI 兼容接口（DeepSeek、OpenAI、通义等）"
        icon={Bot}
      >
        <ToggleRow
          label="启用 AI 服务"
          description="关闭后知识库助手将不可用"
          checked={settings.ai.enabled}
          onChange={(v) => update('ai', { enabled: v })}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-sm mb-2" style={{ color: '#382C25' }}>
              服务商预设
            </label>
            <select
              value={providerId}
              onChange={(e) => applyPreset(e.target.value)}
              className="w-full px-4 py-2.5 border rounded-lg text-sm bg-white"
              style={inputStyle}
            >
              {AI_PROVIDER_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm mb-2" style={{ color: '#382C25' }}>
              模型
            </label>
            <select
              value={settings.ai.model}
              onChange={(e) => update('ai', { model: e.target.value })}
              className="w-full px-4 py-2.5 border rounded-lg text-sm bg-white"
              style={inputStyle}
            >
              {(currentPreset?.models ?? [settings.ai.model]).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-sm mb-2" style={{ color: '#382C25' }}>
            API Base URL
          </label>
          <input
            type="url"
            value={settings.ai.baseUrl}
            onChange={(e) => update('ai', { baseUrl: e.target.value })}
            className="w-full px-4 py-2.5 border rounded-lg text-sm"
            style={inputStyle}
          />
        </div>

        <div className="mt-4">
          <label className="block text-sm mb-2" style={{ color: '#382C25' }}>
            API Key
          </label>
          {settings.ai.apiKeyConfigured && (
            <p className="text-xs mb-2" style={{ color: '#7A6E68' }}>
              当前已配置：{settings.ai.apiKeyPreview}（留空保存则保持不变）
            </p>
          )}
          <input
            type="password"
            value={newApiKey}
            onChange={(e) => setNewApiKey(e.target.value)}
            placeholder={settings.ai.apiKeyConfigured ? '输入新 Key 以更换' : 'sk-...'}
            className="w-full px-4 py-2.5 border rounded-lg text-sm"
            style={inputStyle}
            autoComplete="off"
          />
        </div>

        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-sm mb-2" style={{ color: '#382C25' }}>
              温度 ({settings.ai.temperature})
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={settings.ai.temperature}
              onChange={(e) => update('ai', { temperature: Number(e.target.value) })}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm mb-2" style={{ color: '#382C25' }}>
              最大回复 Token
            </label>
            <input
              type="number"
              min={256}
              max={8192}
              value={settings.ai.maxTokens}
              onChange={(e) => update('ai', { maxTokens: Number(e.target.value) })}
              className="w-full px-4 py-2.5 border rounded-lg text-sm"
              style={inputStyle}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <button
            type="button"
            disabled={testing}
            onClick={handleTestAi}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm border disabled:opacity-60"
            style={{ borderColor: '#5EC4B6', color: '#5EC4B6' }}
          >
            <Zap className="w-4 h-4" />
            {testing ? '测试中…' : newApiKey.trim() ? '测试新 Key（未保存）' : '测试连接'}
          </button>
        </div>
        {testResult && (
          <div className="text-sm mt-3" style={{ color: testResult.ok ? '#5EC4B6' : '#E85D75' }}>
            <p>{testResult.message}</p>
            {!testResult.ok && testResult.detail && (
              <p className="text-xs mt-1 break-all opacity-80" style={{ color: '#7A6E68' }}>
                {testResult.detail}
              </p>
            )}
          </div>
        )}
        {!settings.ai.apiKeyConfigured && !newApiKey.trim() && (
          <p className="text-xs mt-2" style={{ color: '#7A6E68' }}>
            尚未保存 API Key：请粘贴到上方输入框后点「测试新 Key」，成功后再点「保存全部」。
          </p>
        )}
      </SectionCard>

      <SectionCard
        title="知识库 AI 助手"
        description="控制知识库页面的智能问答行为"
        icon={Sparkles}
      >
        <ToggleRow
          label="开启知识库问答"
          description="关闭后 /materials 底部输入框不可用"
          checked={settings.knowledgeAssistant.enabled}
          onChange={(v) => update('knowledgeAssistant', { enabled: v })}
        />

        <div className="mt-4 py-3 border-b" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
          <p className="text-sm mb-3" style={{ color: '#382C25' }}>
            回答依据
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => update('knowledgeAssistant', { answerMode: 'strict' })}
              className="px-4 py-2 rounded-lg text-sm border transition-all"
              style={{
                borderColor:
                  (settings.knowledgeAssistant.answerMode ?? 'strict') === 'strict'
                    ? '#5EC4B6'
                    : 'rgba(56, 44, 37, 0.15)',
                backgroundColor:
                  (settings.knowledgeAssistant.answerMode ?? 'strict') === 'strict'
                    ? 'rgba(94, 196, 182, 0.12)'
                    : 'white',
                color:
                  (settings.knowledgeAssistant.answerMode ?? 'strict') === 'strict'
                    ? '#5EC4B6'
                    : '#7A6E68',
              }}
            >
              严格依据资料
            </button>
            <button
              type="button"
              onClick={() => update('knowledgeAssistant', { answerMode: 'flexible' })}
              className="px-4 py-2 rounded-lg text-sm border transition-all"
              style={{
                borderColor:
                  settings.knowledgeAssistant.answerMode === 'flexible'
                    ? '#5EC4B6'
                    : 'rgba(56, 44, 37, 0.15)',
                backgroundColor:
                  settings.knowledgeAssistant.answerMode === 'flexible'
                    ? 'rgba(94, 196, 182, 0.12)'
                    : 'white',
                color:
                  settings.knowledgeAssistant.answerMode === 'flexible'
                    ? '#5EC4B6'
                    : '#7A6E68',
              }}
            >
              以资料为主（可补充）
            </button>
          </div>
          <p className="text-xs mt-2" style={{ color: '#7A6E68' }}>
            {(settings.knowledgeAssistant.answerMode ?? 'strict') === 'strict'
              ? '只根据已上传资料回答；资料没有的内容会明确说找不到。'
              : '优先引用资料，也可用常识帮助解释；不会编造资料里没有的站点与数据。两种模式都会读取知识库正文。'}
          </p>
        </div>

        <ToggleRow
          label="纳入附件正文"
          description="将 txt/md/docx 正文加入 AI 上下文（两种回答模式均生效）"
          checked={settings.knowledgeAssistant.includeTextFileContent}
          onChange={(v) => update('knowledgeAssistant', { includeTextFileContent: v })}
        />
        <div className="mt-4">
          <label className="block text-sm mb-2" style={{ color: '#382C25' }}>
            回答风格说明（写入系统提示词）
          </label>
          <textarea
            value={settings.knowledgeAssistant.answerStyleGuide ?? ''}
            onChange={(e) =>
              update('knowledgeAssistant', { answerStyleGuide: e.target.value })
            }
            rows={6}
            className="w-full px-4 py-2.5 border rounded-lg text-sm resize-y font-mono text-xs leading-relaxed"
            style={inputStyle}
            placeholder="例如：问路线时用 站点A ➡️ 站点B 格式…"
          />
          <p className="text-xs mt-1" style={{ color: '#7A6E68' }}>
            可规定路线用「➡️」串联、避免默认 1.2.3. 长列表等。保存后新对话生效。
          </p>
        </div>
        <div className="mt-4">
          <label className="block text-sm mb-2" style={{ color: '#382C25' }}>
            欢迎语（基于知识库模式）
          </label>
          <textarea
            value={settings.knowledgeAssistant.welcomeMessage}
            onChange={(e) => update('knowledgeAssistant', { welcomeMessage: e.target.value })}
            rows={3}
            className="w-full px-4 py-2.5 border rounded-lg text-sm resize-none"
            style={inputStyle}
          />
        </div>
        <div className="mt-4">
          <label className="block text-sm mb-2" style={{ color: '#382C25' }}>
            欢迎语（以资料为主 · 可补充模式）
          </label>
          <textarea
            value={
              settings.knowledgeAssistant.flexibleWelcomeMessage ??
              settings.knowledgeAssistant.generalWelcomeMessage ??
              ''
            }
            onChange={(e) =>
              update('knowledgeAssistant', { flexibleWelcomeMessage: e.target.value })
            }
            rows={3}
            className="w-full px-4 py-2.5 border rounded-lg text-sm resize-none"
            style={inputStyle}
          />
        </div>
        <div className="mt-4">
          <label className="block text-sm mb-2" style={{ color: '#382C25' }}>
            对话记忆轮数（每轮 = 一问一答）
          </label>
          <input
            type="number"
            min={2}
            max={30}
            value={settings.knowledgeAssistant.maxHistoryTurns}
            onChange={(e) =>
              update('knowledgeAssistant', { maxHistoryTurns: Number(e.target.value) })
            }
            className="w-full max-w-xs px-4 py-2.5 border rounded-lg text-sm"
            style={inputStyle}
          />
        </div>
      </SectionCard>

      <SectionCard
        title="AI 功能开关"
        description="控制 AI 相关模块是否在系统中显示或可用"
        icon={ToggleLeft}
      >
        <ToggleRow
          label="知识库 AI 对话入口"
          description="关闭后知识库页底部输入框不可用（需同时开启上方「知识库问答」）"
          checked={settings.features.materialsAiChat}
          onChange={(v) => update('features', { materialsAiChat: v })}
        />
      </SectionCard>
      </>
      )}

      {settingsTab === 'system' && (
      <>
      <SectionCard
        title="系统信息"
        description="显示在侧边栏、登录页等位置"
        icon={Building2}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm mb-2" style={{ color: '#382C25' }}>
              系统名称
            </label>
            <input
              type="text"
              value={settings.system.siteName}
              onChange={(e) => update('system', { siteName: e.target.value })}
              className="w-full px-4 py-2.5 border rounded-lg text-sm"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="block text-sm mb-2" style={{ color: '#382C25' }}>
              机构 / 单位名称
            </label>
            <input
              type="text"
              value={settings.system.organizationName}
              onChange={(e) => update('system', { organizationName: e.target.value })}
              className="w-full px-4 py-2.5 border rounded-lg text-sm"
              style={inputStyle}
              placeholder="例如：XX 园林景区"
            />
          </div>
          <div>
            <label className="block text-sm mb-2" style={{ color: '#382C25' }}>
              支持联系方式
            </label>
            <input
              type="text"
              value={settings.system.supportContact}
              onChange={(e) => update('system', { supportContact: e.target.value })}
              className="w-full px-4 py-2.5 border rounded-lg text-sm"
              style={inputStyle}
              placeholder="邮箱或电话，供学员联系管理员"
            />
          </div>
        </div>
      </SectionCard>

      <NavigationCopyEditor
        navigation={navigation}
        onChange={(updater) =>
          setSettings((prev) =>
            prev
              ? { ...prev, navigation: updater(mergeNavigation(prev.navigation)) }
              : prev,
          )
        }
      />

      <SectionCard
        title="功能开关"
        description="控制培训与登录相关模块是否在系统中显示"
        icon={ToggleLeft}
      >
        <ToggleRow
          label="周测模块"
          checked={settings.features.weeklyTest}
          onChange={(v) => update('features', { weeklyTest: v })}
        />
        <ToggleRow
          label="知识答题模块"
          checked={settings.features.knowledgeTest}
          onChange={(v) => update('features', { knowledgeTest: v })}
        />
        <ToggleRow
          label="登录页快捷演示账号"
          checked={settings.features.showQuickLogin}
          onChange={(v) => update('features', { showQuickLogin: v })}
        />
      </SectionCard>
      </>
      )}
    </div>
  );
}
