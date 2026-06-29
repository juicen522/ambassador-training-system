let mammothModule: typeof import('mammoth') | null = null;

async function getMammoth() {
  if (!mammothModule) {
    mammothModule = await import('mammoth');
  }
  return mammothModule.default;
}

/** 是否可把正文提供给 AI（txt/md/docx） */
export function isAiReadableFile(fileName: string): boolean {
  return /\.(txt|md|markdown|docx)$/i.test(fileName);
}

const textCache = new Map<string, string>();

function cacheKey(materialId: string, fileId: string) {
  return `${materialId}:${fileId}`;
}

export async function extractTextFromBlob(
  blob: Blob,
  fileName: string,
): Promise<string> {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';

  if (['txt', 'md', 'markdown', 'csv'].includes(ext)) {
    return (await blob.text()).trim();
  }

  if (ext === 'docx') {
    const mammoth = await getMammoth();
    const buffer = await blob.arrayBuffer();
    const { value } = await mammoth.extractRawText({ arrayBuffer: buffer });
    return value.trim();
  }

  return '';
}

export async function extractMaterialFileText(
  materialId: string,
  fileId: string,
  fileName: string,
  fetchBlob: () => Promise<Blob>,
): Promise<string> {
  const key = cacheKey(materialId, fileId);
  const cached = textCache.get(key);
  if (cached !== undefined) return cached;

  const blob = await fetchBlob();
  const text = await extractTextFromBlob(blob, fileName);
  textCache.set(key, text);
  return text;
}

export function clearTextExtractCache() {
  textCache.clear();
}
