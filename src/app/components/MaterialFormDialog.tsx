import { useEffect, useRef, useState } from 'react';
import { Upload, X, Trash2 } from 'lucide-react';
import {
  MATERIAL_CATEGORIES,
  inferMaterialType,
  titleFromFileName,
  type Material,
  type MaterialCategory,
  type MaterialInput,
  type MaterialType,
} from '../types/material';
import { formatFileSize } from '../lib/materialsDb';
import { formatUploadError } from '../lib/errorMessage';

interface MaterialFormDialogProps {
  open: boolean;
  material?: Material | null;
  onClose: () => void;
  onSubmit: (
    input: MaterialInput,
    files: File[],
    options?: { batchAsSeparate?: boolean; removeFileIds?: string[] },
  ) => Promise<void>;
}

const MATERIAL_TYPES: MaterialType[] = ['PDF', '视频', '图片', '文档', '其他'];

const emptyForm = (): MaterialInput => ({
  title: '',
  category: MATERIAL_CATEGORIES[0],
  type: 'PDF',
  description: '',
});

export default function MaterialFormDialog({
  open,
  material,
  onClose,
  onSubmit,
}: MaterialFormDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<MaterialInput>(emptyForm);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [removeFileIds, setRemoveFileIds] = useState<string[]>([]);
  const [titleTouched, setTitleTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isEdit = Boolean(material);
  const existingFiles =
    material?.files.filter((f) => !removeFileIds.includes(f.id)) ?? [];

  useEffect(() => {
    if (!open) return;

    if (material) {
      setForm({
        title: material.title,
        category: material.category,
        type: material.type,
        description: material.description,
      });
    } else {
      setForm(emptyForm());
    }
    setSelectedFiles([]);
    setRemoveFileIds([]);
    setTitleTouched(false);
    setError('');
  }, [open, material]);

  if (!open) return null;

  const handleFilesChange = (files: File[]) => {
    setSelectedFiles(files);

    if (!titleTouched && files.length === 1) {
      setForm((prev) => ({
        ...prev,
        title: titleFromFileName(files[0].name),
        type: inferMaterialType(files[0]),
      }));
    } else if (!titleTouched && files.length > 1) {
      setForm((prev) => ({ ...prev, title: '' }));
    }
  };

  const batchMode = !isEdit && selectedFiles.length > 1 && !form.title.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isEdit && selectedFiles.length === 0) {
      setError('请从本机选择至少一个文件');
      return;
    }

    if (!batchMode && !form.title.trim()) {
      setError('请填写资料标题，或只选一个文件以自动使用文件名');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(
        {
          ...form,
          title: form.title.trim() || titleFromFileName(selectedFiles[0]?.name ?? ''),
          description: form.description.trim(),
        },
        selectedFiles,
        {
          batchAsSeparate: batchMode,
          removeFileIds: isEdit ? removeFileIds : undefined,
        },
      );
      onClose();
    } catch (err) {
      console.error('资料保存失败', err);
      setError(formatUploadError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10"
          style={{ borderColor: 'rgba(56, 44, 37, 0.08)' }}
        >
          <h2 className="text-lg font-medium" style={{ color: '#382C25' }}>
            {isEdit ? '编辑资料' : '添加资料'}
          </h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded" style={{ color: '#7A6E68' }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm mb-2" style={{ color: '#382C25' }}>
              标题 {batchMode ? '（批量模式将用各文件名）' : '*'}
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => {
                setTitleTouched(true);
                setForm({ ...form, title: e.target.value });
              }}
              disabled={batchMode}
              className="w-full px-4 py-2.5 border rounded-lg outline-none text-sm disabled:bg-gray-50"
              style={{ borderColor: 'rgba(56, 44, 37, 0.15)', color: '#382C25' }}
              placeholder={
                batchMode
                  ? '已选多个文件，将按文件名分别创建'
                  : '选单个文件可自动填入文件名'
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-2" style={{ color: '#382C25' }}>
                分类
              </label>
              <select
                value={form.category}
                onChange={(e) =>
                  setForm({ ...form, category: e.target.value as MaterialCategory })
                }
                className="w-full px-4 py-2.5 border rounded-lg outline-none text-sm bg-white"
                style={{ borderColor: 'rgba(56, 44, 37, 0.15)', color: '#382C25' }}
              >
                {MATERIAL_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm mb-2" style={{ color: '#382C25' }}>
                类型 {batchMode ? '（各文件自动识别）' : ''}
              </label>
              <select
                value={form.type}
                onChange={(e) =>
                  setForm({ ...form, type: e.target.value as MaterialType })
                }
                disabled={batchMode}
                className="w-full px-4 py-2.5 border rounded-lg outline-none text-sm bg-white disabled:bg-gray-50"
                style={{ borderColor: 'rgba(56, 44, 37, 0.15)', color: '#382C25' }}
              >
                {MATERIAL_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm mb-2" style={{ color: '#382C25' }}>
              简介
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full px-4 py-2.5 border rounded-lg outline-none text-sm resize-none"
              style={{ borderColor: 'rgba(56, 44, 37, 0.15)', color: '#382C25' }}
              placeholder="批量添加时，简介会应用到每条资料"
            />
          </div>

          {isEdit && existingFiles.length > 0 && (
            <div>
              <label className="block text-sm mb-2" style={{ color: '#382C25' }}>
                已有文件
              </label>
              <ul className="space-y-2">
                {existingFiles.map((file) => (
                  <li
                    key={file.id}
                    className="flex items-center justify-between px-3 py-2 rounded-lg text-sm"
                    style={{ backgroundColor: '#F5F5F5', color: '#382C25' }}
                  >
                    <span className="truncate flex-1 mr-2" title={file.fileName}>
                      {file.fileName}
                      <span className="text-xs ml-2" style={{ color: '#7A6E68' }}>
                        {file.type} · {formatFileSize(file.fileSize)}
                      </span>
                    </span>
                    {!file.id.startsWith('legacy-') && (
                      <button
                        type="button"
                        onClick={() => setRemoveFileIds((ids) => [...ids, file.id])}
                        className="p-1 rounded shrink-0"
                        style={{ color: '#E85D75' }}
                        title="移除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <label className="block text-sm mb-2" style={{ color: '#382C25' }}>
              {isEdit ? '追加本地文件' : '本地文件 *'}
            </label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              accept=".pdf,.doc,.docx,.txt,.md,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.mp4,.webm,.mov"
              onChange={(e) => {
                handleFilesChange(Array.from(e.target.files ?? []));
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 px-4 py-6 border-2 border-dashed rounded-lg transition-all text-sm"
              style={{
                borderColor: selectedFiles.length ? '#5EC4B6' : 'rgba(56, 44, 37, 0.2)',
                color: '#7A6E68',
                backgroundColor: '#FAFAFA',
              }}
            >
              <Upload className="w-5 h-5" style={{ color: '#5EC4B6' }} />
              {selectedFiles.length
                ? `已选 ${selectedFiles.length} 个文件，点击可继续添加`
                : '点击选择本机文件（可多选）'}
            </button>

            {selectedFiles.length > 0 && (
              <ul className="mt-3 space-y-1.5 max-h-40 overflow-y-auto">
                {selectedFiles.map((file, index) => (
                  <li
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between text-xs px-3 py-2 rounded"
                    style={{ backgroundColor: 'rgba(94, 196, 182, 0.08)', color: '#382C25' }}
                  >
                    <span className="truncate flex-1">
                      {titleFromFileName(file.name)}
                      <span style={{ color: '#7A6E68' }}> · {file.name}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedFiles((prev) => prev.filter((_, i) => i !== index))
                      }
                      className="ml-2 shrink-0"
                      style={{ color: '#E85D75' }}
                    >
                      移除
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {!isEdit && selectedFiles.length > 1 && (
              <p className="text-xs mt-2" style={{ color: '#5EC4B6' }}>
                未填写标题时：将按每个文件名各创建一条资料；填写标题则合并为一条资料（含多个附件）
              </p>
            )}
          </div>

          {error && (
            <p className="text-sm" style={{ color: '#E85D75' }}>
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-lg border text-sm"
              style={{ borderColor: 'rgba(56, 44, 37, 0.15)', color: '#7A6E68' }}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2.5 rounded-lg text-white text-sm disabled:opacity-60"
              style={{ backgroundColor: '#5EC4B6' }}
            >
              {submitting
                ? '保存中…'
                : batchMode
                  ? `批量添加 ${selectedFiles.length} 条`
                  : isEdit
                    ? '保存'
                    : '添加'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
