import { getToken } from './api';

export async function fetchMaterialFileBlob(
  materialId: string,
  fileId: string,
): Promise<Blob> {
  const headers: HeadersInit = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api/materials/${materialId}/files/${fileId}`, { headers });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || '加载文件失败');
  }
  return res.blob();
}
