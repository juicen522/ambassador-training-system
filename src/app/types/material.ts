export const MATERIAL_CATEGORIES = [
  '植物识别',
  '园林历史',
  '讲解技巧',
  '服务规范',
  '安全知识',
] as const;

export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number];

export type MaterialType = 'PDF' | '视频' | '图片' | '文档' | '其他';

export interface MaterialFile {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  type: MaterialType;
}

export interface Material {
  id: string;
  title: string;
  category: MaterialCategory;
  type: MaterialType;
  description: string;
  /** 隐藏后用户知识库不可见，AI 仍可使用 */
  hidden?: boolean;
  sortOrder?: number;
  views: number;
  files: MaterialFile[];
  createdAt: string;
  updatedAt: string;
}

export interface MaterialInput {
  title: string;
  category: MaterialCategory;
  type: MaterialType;
  description: string;
  hidden?: boolean;
}

/** 从文件名去掉扩展名，用作默认标题 */
export function titleFromFileName(name: string): string {
  const base = name.replace(/\.[^/.]+$/, '').trim();
  return base || name;
}

export function inferMaterialType(file: File): MaterialType {
  const mime = file.type.toLowerCase();
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
    return '图片';
  }
  if (mime.startsWith('video/') || ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) {
    return '视频';
  }
  if (mime === 'application/pdf' || ext === 'pdf') {
    return 'PDF';
  }
  if (
    ['doc', 'docx', 'txt', 'md', 'ppt', 'pptx', 'xls', 'xlsx'].includes(ext) ||
    mime.includes('document') ||
    mime.includes('text')
  ) {
    return '文档';
  }
  return '其他';
}

export function materialHasFiles(material: Material): boolean {
  return material.files.length > 0;
}

export function resolveMaterialType(files: MaterialFile[], fallback: MaterialType): MaterialType {
  if (files.length === 0) return fallback;
  if (files.length === 1) return files[0].type;
  const types = new Set(files.map((f) => f.type));
  return types.size === 1 ? files[0].type : fallback;
}
