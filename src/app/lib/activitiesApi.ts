import { apiFetch } from './api';
import type { Activity, ActivityInput } from '../types/activity';

function normalizeActivity(raw: Activity): Activity {
  return {
    id: raw.id,
    title: raw.title,
    theme: raw.theme,
    copywriting: raw.copywriting,
    status: raw.status === 'published' ? 'published' : 'draft',
    sortOrder: raw.sortOrder ?? 0,
    coverImageName: raw.coverImageName ?? null,
    coverImageUrl: raw.coverImageUrl ?? null,
    images: raw.images ?? [],
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export async function listActivitiesApi(): Promise<Activity[]> {
  const data = await apiFetch('/activities');
  return (data.activities as Activity[]).map(normalizeActivity);
}

/** 首页/相册页：仅已发布活动 */
export async function listPublishedActivitiesApi(): Promise<Activity[]> {
  try {
    const data = await apiFetch('/activities/published');
    return (data.activities as Activity[]).map(normalizeActivity);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    const stale =
      message.includes('后端版本过旧') ||
      message.includes('请求失败（404）') ||
      message.includes('Cannot GET');
    if (!stale) throw err;
    const data = await apiFetch('/activities');
    return (data.activities as Activity[])
      .map(normalizeActivity)
      .filter((a) => a.status === 'published');
  }
}

export async function getActivityApi(id: string): Promise<Activity> {
  const data = await apiFetch(`/activities/${id}`);
  return normalizeActivity(data.activity);
}

export async function createActivityApi(input: ActivityInput): Promise<Activity> {
  const data = await apiFetch('/activities', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return normalizeActivity(data.activity);
}

export async function updateActivityApi(
  id: string,
  input: ActivityInput,
): Promise<Activity> {
  const data = await apiFetch(`/activities/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  return normalizeActivity(data.activity);
}

export async function deleteActivityApi(id: string): Promise<void> {
  await apiFetch(`/activities/${id}`, { method: 'DELETE' });
}

export async function uploadActivityCoverApi(
  id: string,
  files: File[],
): Promise<Activity> {
  const form = new FormData();
  for (const file of files) {
    form.append('images', file);
  }
  const data = await apiFetch(`/activities/${id}/images`, {
    method: 'POST',
    body: form,
  });
  return normalizeActivity(data.activity);
}

export async function removeActivityImageApi(
  activityId: string,
  imageId: string,
): Promise<Activity> {
  const data = await apiFetch(`/activities/${activityId}/images/${imageId}`, {
    method: 'DELETE',
  });
  return normalizeActivity(data.activity);
}

export async function reorderActivityImagesApi(
  activityId: string,
  imageIds: string[],
): Promise<Activity> {
  const data = await apiFetch(`/activities/${activityId}/images/reorder`, {
    method: 'POST',
    body: JSON.stringify({ ids: imageIds }),
  });
  return normalizeActivity(data.activity);
}

export async function reorderActivitiesApi(ids: string[]): Promise<Activity[]> {
  const data = await apiFetch('/activities/reorder', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
  return (data.activities as Activity[]).map(normalizeActivity);
}
