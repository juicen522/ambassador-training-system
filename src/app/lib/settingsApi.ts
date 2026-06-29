import { apiFetch } from './api';
import { mergeNavigation } from './mergeNavigation';
import type { AppSettings, PublicAppSettings } from '../types/settings';

export async function fetchAdminSettings(): Promise<AppSettings> {
  return apiFetch('/settings');
}

export async function saveAdminSettings(settings: AppSettings): Promise<AppSettings> {
  return apiFetch('/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

export async function testAiSettings(ai?: {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}): Promise<{ ok: boolean; message: string; detail?: string; model?: string }> {
  return apiFetch('/settings/test-ai', {
    method: 'POST',
    body: JSON.stringify({ ai }),
  });
}

export function normalizePublicSettings(data: PublicAppSettings): PublicAppSettings {
  return {
    ...data,
    navigation: mergeNavigation(data.navigation),
  };
}

export async function fetchPublicSettings(): Promise<PublicAppSettings> {
  const res = await fetch(`/api/settings/public?_=${Date.now()}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('无法加载公开配置');
  const data = (await res.json()) as PublicAppSettings;
  if (!data.navigation?.dashboard?.menuLabel) {
    throw new Error('后端版本过旧，请重启 npm run dev');
  }
  return normalizePublicSettings(data);
}
