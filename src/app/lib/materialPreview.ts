let mammothModule: typeof import('mammoth') | null = null;

async function convertDocxToHtml(buffer: ArrayBuffer): Promise<string> {
  if (!mammothModule) {
    mammothModule = await import('mammoth');
  }
  const { value } = await mammothModule.default.convertToHtml({ arrayBuffer: buffer });
  return value || '<p>（未能解析文档内容）</p>';
}

export type PreviewKind = 'text' | 'html' | 'pdf' | 'image' | 'video' | 'unsupported';

export type PreviewResult =
  | { kind: 'text'; text: string }
  | { kind: 'html'; html: string }
  | { kind: 'blob-url'; url: string; mimeType: string }
  | { kind: 'unsupported'; reason: string };

export function getPreviewKind(fileName: string, mimeType: string): PreviewKind {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const mime = mimeType.toLowerCase();

  if (
    ['txt', 'md', 'markdown', 'csv'].includes(ext) ||
    mime.startsWith('text/') ||
    mime === 'application/json'
  ) {
    return 'text';
  }
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (
    mime.startsWith('image/') ||
    ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)
  ) {
    return 'image';
  }
  if (
    mime.startsWith('video/') ||
    ['mp4', 'webm', 'mov', 'm4v'].includes(ext)
  ) {
    return 'video';
  }
  if (
    ext === 'docx' ||
    mime ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return 'html';
  }

  return 'unsupported';
}

export async function buildPreview(
  blob: Blob,
  fileName: string,
  mimeType: string,
): Promise<PreviewResult> {
  const kind = getPreviewKind(fileName, mimeType);

  switch (kind) {
    case 'text': {
      const text = await blob.text();
      return { kind: 'text', text: text.trim() || '（文件为空）' };
    }
    case 'html': {
      const buffer = await blob.arrayBuffer();
      const html = await convertDocxToHtml(buffer);
      return { kind: 'html', html };
    }
    case 'pdf':
    case 'image':
    case 'video':
      return {
        kind: 'blob-url',
        url: URL.createObjectURL(blob),
        mimeType: mimeType || blob.type || 'application/octet-stream',
      };
    default:
      return {
        kind: 'unsupported',
        reason: '暂不支持在页面内预览此格式，请下载后查看',
      };
  }
}

export function revokePreviewUrl(result: PreviewResult) {
  if (result.kind === 'blob-url') {
    URL.revokeObjectURL(result.url);
  }
}
