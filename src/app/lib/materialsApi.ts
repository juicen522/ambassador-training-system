import { apiFetch } from './api';
import type { Material, MaterialInput } from '../types/material';

function normalizeMaterial(raw: Material & { files?: Material['files'] }): Material {
  const files = raw.files ?? [];
  return {
    id: raw.id,
    title: raw.title,
    category: raw.category,
    type: raw.type,
    description: raw.description,
    hidden: Boolean(raw.hidden),
    sortOrder: raw.sortOrder ?? 0,
    views: raw.views,
    files,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export async function listMaterialsApi(): Promise<Material[]> {
  const data = await apiFetch('/materials');
  return (data.materials as Material[]).map(normalizeMaterial);
}

export async function listMaterialsForAiApi(): Promise<Material[]> {
  const data = await apiFetch('/materials/for-ai');
  return (data.materials as Material[]).map(normalizeMaterial);
}

/** 服务端解析知识库全部可识别文件并返回 AI 上下文 */
export async function fetchKnowledgeContextApi(query?: string): Promise<string> {
  const data = await apiFetch('/materials/knowledge-context', {
    method: 'POST',
    body: JSON.stringify({ query: query?.trim() || '' }),
  });
  return String((data as { context?: string }).context ?? '');
}

/** 管理员：重新解析全部知识库附件正文 */
export async function reindexMaterialTextApi(): Promise<{
  ok: boolean;
  indexed: number;
}> {
  const data = await apiFetch('/materials/index-text', { method: 'POST' });
  return data as { ok: boolean; indexed: number };
}

export async function createMaterialApi(input: MaterialInput): Promise<Material> {
  const data = await apiFetch('/materials', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return normalizeMaterial(data.material);
}

export async function uploadMaterialFilesApi(
  materialId: string,
  files: File[],
): Promise<Material> {
  const form = new FormData();
  for (const file of files) {
    form.append('files', file);
  }
  const data = await apiFetch(`/materials/${materialId}/files`, {
    method: 'POST',
    body: form,
  });
  return normalizeMaterial(data.material);
}

export async function reorderMaterialsApi(ids: string[]): Promise<Material[]> {
  const data = await apiFetch('/materials/reorder', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
  return (data.materials as Material[]).map(normalizeMaterial);
}

export async function toggleMaterialHiddenApi(
  id: string,
  hidden: boolean,
): Promise<Material> {
  const data = await apiFetch(`/materials/${id}/hidden`, {
    method: 'POST',
    body: JSON.stringify({ hidden }),
  });
  return normalizeMaterial(data.material);
}

export async function updateMaterialApi(
  id: string,
  input: MaterialInput,
): Promise<Material> {
  const data = await apiFetch(`/materials/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  return normalizeMaterial(data.material);
}

export async function deleteMaterialApi(id: string): Promise<void> {
  await apiFetch(`/materials/${id}`, { method: 'DELETE' });
}

export async function deleteMaterialFileApi(
  materialId: string,
  fileId: string,
): Promise<Material> {
  const data = await apiFetch(`/materials/${materialId}/files/${fileId}`, {
    method: 'DELETE',
  });
  return normalizeMaterial(data.material);
}

export async function recordMaterialViewApi(id: string): Promise<Material> {
  const data = await apiFetch(`/materials/${id}/view`, { method: 'POST' });
  return normalizeMaterial(data.material);
}

export async function downloadMaterialFileUrl(materialId: string, fileId: string) {
  return `/api/materials/${materialId}/files/${fileId}`;
}
