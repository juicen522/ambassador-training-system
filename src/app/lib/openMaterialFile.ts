import { fetchMaterialFileBlob } from './fetchMaterialFile';
import type { Material, MaterialFile } from '../types/material';
import { materialHasFiles } from '../types/material';

function openBlob(blob: Blob, fileName: string, mimeType: string) {
  const url = URL.createObjectURL(blob);

  if (mimeType.startsWith('image/') || mimeType === 'application/pdf') {
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
  }

  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** @deprecated 请使用知识库阅读页 /materials/:id */
export async function openMaterialFile(
  material: Material,
  file?: MaterialFile,
): Promise<boolean> {
  if (!materialHasFiles(material)) {
    window.alert('该资料尚未上传文件，请在「培训管理 → 知识库管理」中补充。');
    return false;
  }

  const target = file ?? material.files[0];

  try {
    const blob = await fetchMaterialFileBlob(material.id, target.id);
    openBlob(blob, target.fileName, target.mimeType);
    return true;
  } catch (err) {
    window.alert(err instanceof Error ? err.message : '无法打开文件');
    return false;
  }
}

export function pickMaterialFile(material: Material): Promise<MaterialFile | null> {
  if (material.files.length <= 1) {
    return Promise.resolve(material.files[0] ?? null);
  }

  const names = material.files.map((f, i) => `${i + 1}. ${f.fileName}`).join('\n');
  const input = window.prompt(
    `「${material.title}」包含 ${material.files.length} 个文件，请输入序号打开：\n\n${names}`,
    '1',
  );

  if (input === null) return Promise.resolve(null);

  const index = Number.parseInt(input.trim(), 10) - 1;
  if (Number.isNaN(index) || index < 0 || index >= material.files.length) {
    window.alert('序号无效');
    return Promise.resolve(null);
  }

  return Promise.resolve(material.files[index]);
}

export async function openMaterial(material: Material): Promise<boolean> {
  const file = await pickMaterialFile(material);
  if (!file) return false;
  return openMaterialFile(material, file);
}
