import { fetchMaterialFileBlob } from './fetchMaterialFile';
import {
  buildPreview,
  revokePreviewUrl,
  type PreviewResult,
} from './materialPreview';

function cacheKey(materialId: string, fileId: string) {
  return `${materialId}:${fileId}`;
}

const previewCache = new Map<string, PreviewResult>();
const blobCache = new Map<string, Blob>();
const inflight = new Map<string, Promise<{ preview: PreviewResult; blob: Blob }>>();

export function getCachedPreview(
  materialId: string,
  fileId: string,
): PreviewResult | undefined {
  return previewCache.get(cacheKey(materialId, fileId));
}

export function getCachedBlob(materialId: string, fileId: string): Blob | undefined {
  return blobCache.get(cacheKey(materialId, fileId));
}

export async function loadMaterialPreview(
  materialId: string,
  fileId: string,
  fileName: string,
  mimeType: string,
): Promise<{ preview: PreviewResult; blob: Blob }> {
  const key = cacheKey(materialId, fileId);
  const cached = previewCache.get(key);
  const cachedBlob = blobCache.get(key);
  if (cached && cachedBlob) {
    return { preview: cached, blob: cachedBlob };
  }

  const pending = inflight.get(key);
  if (pending) return pending;

  const task = (async () => {
    const blob = await fetchMaterialFileBlob(materialId, fileId);
    const preview = await buildPreview(blob, fileName, mimeType);
    blobCache.set(key, blob);
    previewCache.set(key, preview);
    inflight.delete(key);
    return { preview, blob };
  })();

  inflight.set(key, task);
  try {
    return await task;
  } catch (err) {
    inflight.delete(key);
    throw err;
  }
}

export function clearPreviewCacheForMaterial(materialId: string) {
  for (const key of [...previewCache.keys()]) {
    if (!key.startsWith(`${materialId}:`)) continue;
    revokePreviewUrl(previewCache.get(key)!);
    previewCache.delete(key);
    blobCache.delete(key);
    inflight.delete(key);
  }
}
