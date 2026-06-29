import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { fetchPublicSettings, normalizePublicSettings } from '../lib/settingsApi';
import { mergeNavigation } from '../lib/mergeNavigation';
import type { NavigationSettings, PublicAppSettings } from '../types/settings';
import { DEFAULT_NAVIGATION } from '../types/settings';

const DEFAULT_PUBLIC: PublicAppSettings = {
  system: { siteName: '园林大使培训系统', organizationName: '' },
  knowledgeAssistant: {
    enabled: true,
    answerMode: 'strict',
    welcomeMessage:
      '你好！我是基于本系统知识库的 AI 助手，回答内容仅来自已上传的培训资料。有什么想了解的吗？',
    flexibleWelcomeMessage:
      '你好！我以知识库内容为主回答，必要时也会用通用知识帮你解释清楚。具体路线与专有名称仍以知识库为准。',
    maxHistoryTurns: 10,
    includeTextFileContent: true,
  },
  features: {
    materialsAiChat: true,
    weeklyTest: true,
    knowledgeTest: true,
    showQuickLogin: true,
  },
  navigation: DEFAULT_NAVIGATION,
  aiConfigured: false,
};

interface SettingsContextType {
  publicSettings: PublicAppSettings;
  loading: boolean;
  /** 每次 refresh 后递增，用于驱动文案类组件更新 */
  revision: number;
  refresh: () => Promise<void>;
  /** 保存配置后立即写入公开文案（不依赖 /settings/public 是否已更新） */
  applyNavigation: (navigation: NavigationSettings) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [publicSettings, setPublicSettings] = useState<PublicAppSettings>(DEFAULT_PUBLIC);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  const bump = useCallback(() => {
    setRevision((r) => r + 1);
    window.dispatchEvent(new Event('app-settings-updated'));
  }, []);

  const applyNavigation = useCallback(
    (navigation: NavigationSettings) => {
      const merged = mergeNavigation(navigation);
      setPublicSettings((prev) =>
        normalizePublicSettings({
          ...prev,
          navigation: merged,
        }),
      );
      bump();
    },
    [bump],
  );

  const refresh = useCallback(async () => {
    try {
      const data = await fetchPublicSettings();
      setPublicSettings(data);
      bump();
    } catch (err) {
      console.warn('[settings] refresh failed:', err);
      bump();
    }
  }, [bump]);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const value = useMemo(
    () => ({ publicSettings, loading, revision, refresh, applyNavigation }),
    [publicSettings, loading, revision, refresh, applyNavigation],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return ctx;
}
