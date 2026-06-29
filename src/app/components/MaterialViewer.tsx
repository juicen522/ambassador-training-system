import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, Download, FileText, Loader2 } from 'lucide-react';
import { useMaterials } from '../contexts/MaterialsContext';
import {
  getCachedBlob,
  getCachedPreview,
  loadMaterialPreview,
} from '../lib/previewCache';
import type { PreviewResult } from '../lib/materialPreview';
import { materialHasFiles, type MaterialFile } from '../types/material';

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function PreviewBody({
  preview,
  fileName,
}: {
  preview: PreviewResult;
  fileName: string;
}) {
  if (preview.kind === 'text') {
    return (
      <pre
        className="whitespace-pre-wrap break-words text-sm leading-relaxed font-sans p-6"
        style={{ color: '#382C25' }}
      >
        {preview.text}
      </pre>
    );
  }

  if (preview.kind === 'html') {
    return (
      <article
        className="material-doc prose-like p-6 max-w-none text-sm leading-relaxed"
        style={{ color: '#382C25' }}
        dangerouslySetInnerHTML={{ __html: preview.html }}
      />
    );
  }

  if (preview.kind === 'blob-url') {
    if (preview.mimeType.startsWith('image/')) {
      return (
        <div className="flex items-center justify-center p-6 min-h-[50vh] bg-[#FAFAFA]">
          <img
            src={preview.url}
            alt={fileName}
            className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-sm"
          />
        </div>
      );
    }
    if (preview.mimeType.startsWith('video/')) {
      return (
        <div className="p-6 flex justify-center bg-black/5">
          <video
            src={preview.url}
            controls
            className="max-w-full max-h-[75vh] rounded-lg"
          >
            您的浏览器不支持视频播放
          </video>
        </div>
      );
    }
    return (
      <iframe
        title={fileName}
        src={preview.url}
        className="w-full border-0"
        style={{ minHeight: '75vh' }}
      />
    );
  }

  return (
    <p className="p-8 text-center text-sm" style={{ color: '#7A6E68' }}>
      {preview.reason}
    </p>
  );
}

export default function MaterialViewer() {
  const { materialId } = useParams<{ materialId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { materials, loading, recordView } = useMaterials();
  const viewRecorded = useRef(false);

  const material = useMemo(
    () => materials.find((m) => m.id === materialId),
    [materials, materialId],
  );

  const files = material?.files ?? [];
  const activeFileId = searchParams.get('file') ?? files[0]?.id ?? '';
  const activeFile = files.find((f) => f.id === activeFileId);

  const fileMeta = activeFile
    ? { name: activeFile.fileName, mime: activeFile.mimeType }
    : null;

  const [preview, setPreview] = useState<PreviewResult | null>(() =>
    materialId && activeFileId
      ? getCachedPreview(materialId, activeFileId) ?? null
      : null,
  );
  const [downloadBlobCache, setDownloadBlobCache] = useState<Blob | null>(() =>
    materialId && activeFileId
      ? getCachedBlob(materialId, activeFileId) ?? null
      : null,
  );
  const [loadingFile, setLoadingFile] = useState(
    () => !(materialId && activeFileId && getCachedPreview(materialId, activeFileId)),
  );
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!materialId || viewRecorded.current) return;
    viewRecorded.current = true;
    recordView(materialId).catch(() => {});
  }, [materialId, recordView]);

  useEffect(() => {
    if (!materialId || !activeFileId || !fileMeta) {
      return;
    }

    const cached = getCachedPreview(materialId, activeFileId);
    const cachedBlob = getCachedBlob(materialId, activeFileId);
    if (cached && cachedBlob) {
      setPreview(cached);
      setDownloadBlobCache(cachedBlob);
      setLoadingFile(false);
      setLoadError('');
      return;
    }

    let cancelled = false;
    setLoadingFile(true);
    setLoadError('');

    loadMaterialPreview(
      materialId,
      activeFileId,
      fileMeta.name,
      fileMeta.mime,
    )
      .then(({ preview: result, blob }) => {
        if (cancelled) return;
        setPreview(result);
        setDownloadBlobCache(blob);
        setLoadError('');
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : '加载失败');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingFile(false);
      });

    return () => {
      cancelled = true;
    };
  }, [materialId, activeFileId, fileMeta?.name, fileMeta?.mime]);

  const selectFile = (file: MaterialFile) => {
    if (file.id === activeFileId) return;
    const cached = materialId ? getCachedPreview(materialId, file.id) : null;
    const cachedBlob = materialId ? getCachedBlob(materialId, file.id) : null;
    if (cached && cachedBlob) {
      setPreview(cached);
      setDownloadBlobCache(cachedBlob);
      setLoadingFile(false);
      setLoadError('');
    } else {
      setLoadingFile(true);
    }
    setSearchParams({ file: file.id }, { replace: true });
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center gap-2" style={{ color: '#7A6E68' }}>
        <Loader2 className="w-5 h-5 animate-spin" />
        加载中…
      </div>
    );
  }

  if (!material) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center">
        <p className="text-sm mb-4" style={{ color: '#7A6E68' }}>
          资料不存在或已被删除
        </p>
        <Link to="/materials" className="text-sm" style={{ color: '#5EC4B6' }}>
          返回知识库
        </Link>
      </div>
    );
  }

  if (!materialHasFiles(material)) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center">
        <FileText className="w-12 h-12 mx-auto mb-3" style={{ color: '#7A6E68' }} />
        <h1 className="text-lg font-medium mb-2" style={{ color: '#382C25' }}>
          {material.title}
        </h1>
        <p className="text-sm mb-4" style={{ color: '#7A6E68' }}>
          该资料尚未上传文件
        </p>
        <Link to="/materials" className="text-sm" style={{ color: '#5EC4B6' }}>
          返回知识库
        </Link>
      </div>
    );
  }

  const showContent = preview && !loadError;

  return (
    <div className="min-h-full flex flex-col" style={{ backgroundColor: '#FAFAFA' }}>
      <header
        className="sticky top-0 z-10 bg-white border-b px-6 py-4"
        style={{ borderColor: 'rgba(56, 44, 37, 0.08)' }}
      >
        <div className="max-w-5xl mx-auto flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/materials')}
            className="flex items-center gap-1.5 text-sm shrink-0"
            style={{ color: '#5EC4B6' }}
          >
            <ArrowLeft className="w-4 h-4" />
            知识库
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-medium truncate" style={{ color: '#382C25' }}>
              {material.title}
            </h1>
          </div>
          {activeFile && downloadBlobCache && (
            <button
              type="button"
              onClick={() => downloadBlob(downloadBlobCache, activeFile.fileName)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border shrink-0"
              style={{ borderColor: 'rgba(56, 44, 37, 0.15)', color: '#382C25' }}
            >
              <Download className="w-4 h-4" />
              下载
            </button>
          )}
        </div>

        {files.length > 1 && (
          <div className="max-w-5xl mx-auto mt-3 flex flex-wrap gap-2">
            {files.map((file) => (
              <button
                key={file.id}
                type="button"
                onClick={() => selectFile(file)}
                className="px-3 py-1.5 rounded-full text-xs transition-all max-w-[240px] truncate"
                style={{
                  backgroundColor: file.id === activeFileId ? '#5EC4B6' : 'white',
                  color: file.id === activeFileId ? 'white' : '#7A6E68',
                  border: `1px solid ${file.id === activeFileId ? '#5EC4B6' : 'rgba(56, 44, 37, 0.15)'}`,
                }}
                title={file.fileName}
              >
                {file.fileName}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto py-6 px-4">
        <div
          className="relative bg-white rounded-lg border overflow-hidden min-h-[60vh]"
          style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
        >
          {showContent && activeFile && (
            <div
              className={loadingFile ? 'opacity-40 pointer-events-none' : ''}
              style={{ transition: 'opacity 0.15s ease' }}
            >
              <PreviewBody preview={preview} fileName={activeFile.fileName} />
            </div>
          )}

          {loadingFile && (
            <div
              className={`flex flex-col items-center justify-center gap-2 py-24 ${
                showContent ? 'absolute inset-0 bg-white/70' : ''
              }`}
              style={{ color: '#7A6E68' }}
            >
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">正在加载文档…</span>
            </div>
          )}

          {!loadingFile && loadError && (
            <p className="p-8 text-center text-sm" style={{ color: '#E85D75' }}>
              {loadError}
            </p>
          )}

          {!loadingFile && !loadError && !preview && (
            <p className="p-8 text-center text-sm" style={{ color: '#7A6E68' }}>
              请选择要阅读的文件
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
