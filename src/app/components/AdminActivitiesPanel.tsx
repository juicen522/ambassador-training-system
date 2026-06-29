import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GripVertical,
  ImagePlus,
  Plus,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import ActivityCopyEditor, {
  type ActivityCopyEditorHandle,
} from './ActivityCopyEditor';
import type {
  Activity,
  ActivityImage,
  ActivityInput,
  ActivityStatus,
} from '../types/activity';
import {
  createActivityApi,
  deleteActivityApi,
  listActivitiesApi,
  reorderActivitiesApi,
  reorderActivityImagesApi,
  removeActivityImageApi,
  updateActivityApi,
  uploadActivityCoverApi,
} from '../lib/activitiesApi';
import { PUBLISHED_ACTIVITIES_EVENT } from '../hooks/usePublishedAlbums';
import {
  clearActivityDraft,
  hasMeaningfulDraft,
  loadMergedActivitySession,
  saveActivityDraft,
} from '../lib/activityDraftStorage';
import {
  ACTIVITY_FLUSH_DRAFT_EVENT,
  clearMemorySession,
  writeMemorySession,
} from '../lib/activityEditorSession';
import { normalizeActivityCopywriting } from '../lib/viTypography';

const EMPTY_FORM: ActivityInput = {
  title: '',
  theme: '',
  copywriting: '',
  status: 'draft',
};

type UploadedTile = {
  kind: 'uploaded';
  id: string;
  url: string;
  name: string;
};

type PendingTile = {
  kind: 'pending';
  key: string;
  url: string;
  file: File;
  name: string;
};

type ImageTile = UploadedTile | PendingTile;

function tileDragId(tile: ImageTile) {
  return tile.kind === 'uploaded' ? tile.id : tile.key;
}

function sortImages(images: ActivityImage[]) {
  return [...images].sort(
    (a, b) =>
      (a.sortOrder ?? Number.MAX_SAFE_INTEGER) -
      (b.sortOrder ?? Number.MAX_SAFE_INTEGER),
  );
}

function imagesToTiles(images: ActivityImage[]): UploadedTile[] {
  return sortImages(images).map((img) => ({
    kind: 'uploaded',
    id: img.id,
    url: img.imageUrl,
    name: img.imageName,
  }));
}

function reorderAtIndex<T>(items: T[], fromIndex: number, insertIndex: number): T[] {
  if (fromIndex < 0 || fromIndex >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  let to = insertIndex;
  if (to > fromIndex) to -= 1;
  to = Math.max(0, Math.min(to, next.length));
  if (to === fromIndex) return items;
  next.splice(to, 0, moved);
  return next;
}

export default function AdminActivitiesPanel() {
  const initialSessionRef = useRef(loadMergedActivitySession());
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [form, setForm] = useState<ActivityInput>(
    () => initialSessionRef.current?.form ?? EMPTY_FORM,
  );
  const [imageTiles, setImageTiles] = useState<ImageTile[]>([]);
  const [uploadDragActive, setUploadDragActive] = useState(false);
  const [savingImageOrder, setSavingImageOrder] = useState(false);
  const [draggingTileId, setDraggingTileId] = useState<string | null>(null);
  const [hoverTargetId, setHoverTargetId] = useState<string | null>(null);
  const [dragGhost, setDragGhost] = useState<{
    url: string;
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const draggingIdRef = useRef<string | null>(null);
  const tileOrderBeforeDragRef = useRef<string[]>([]);
  const reorderingRef = useRef(false);
  const lastHoverTargetRef = useRef<string | null>(null);
  const grabOffsetRef = useRef({ x: 0, y: 0 });
  const dragMetaRef = useRef({ url: '', w: 96, h: 96 });
  const orderRef = useRef<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const copyEditorKey = editing?.id ?? 'new';
  const copyEditorRef = useRef<ActivityCopyEditorHandle | null>(null);
  const editingRestoredRef = useRef(false);
  const editingRef = useRef(editing);
  const formRef = useRef(form);
  editingRef.current = editing;
  formRef.current = form;

  const buildDraftSession = useCallback(() => {
    const copywriting = normalizeActivityCopywriting(
      copyEditorRef.current?.getHtml() ?? formRef.current.copywriting ?? '',
    );
    return {
      editingId: editingRef.current?.id ?? null,
      form: { ...formRef.current, copywriting },
      updatedAt: Date.now(),
    };
  }, []);

  const flushDraft = useCallback(() => {
    const session = buildDraftSession();
    if (!hasMeaningfulDraft(session.form, session.editingId)) return;
    writeMemorySession(session);
    saveActivityDraft(session);
  }, [buildDraftSession]);

  const load = async () => {
    const list = await listActivitiesApi();
    setActivities(list);
  };

  const imageTilesRef = useRef(imageTiles);
  imageTilesRef.current = imageTiles;

  const revokePendingUrls = (tiles: ImageTile[]) => {
    for (const tile of tiles) {
      if (tile.kind === 'pending') URL.revokeObjectURL(tile.url);
    }
  };

  useEffect(() => {
    load()
      .catch((err) =>
        window.alert(err instanceof Error ? err.message : '加载活动失败'),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loading || editingRestoredRef.current) return;
    editingRestoredRef.current = true;

    const session = initialSessionRef.current;
    if (!session?.editingId) return;

    const item = activities.find((a) => a.id === session.editingId);
    if (!item) return;

    revokePendingUrls(imageTilesRef.current);
    setEditing(item);
    setImageTiles(imagesToTiles(item.images));
    setForm((prev) => ({ ...session.form, status: item.status }));
  }, [loading, activities]);

  useEffect(() => {
    if (loading) return;
    const session = buildDraftSession();
    if (!hasMeaningfulDraft(session.form, session.editingId)) return;
    writeMemorySession(session);
    const timer = window.setTimeout(flushDraft, 400);
    return () => window.clearTimeout(timer);
  }, [form, editing, loading, flushDraft, buildDraftSession]);

  useEffect(() => {
    const onFlush = () => flushDraft();
    const onHide = () => {
      if (document.visibilityState === 'hidden') flushDraft();
    };
    window.addEventListener(ACTIVITY_FLUSH_DRAFT_EVENT, onFlush);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener(ACTIVITY_FLUSH_DRAFT_EVENT, onFlush);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      flushDraft();
    };
  }, [flushDraft]);

  const orderedActivities = useMemo(
    () =>
      [...activities].sort(
        (a, b) =>
          (a.sortOrder ?? Number.MAX_SAFE_INTEGER) -
          (b.sortOrder ?? Number.MAX_SAFE_INTEGER),
      ),
    [activities],
  );

  const syncEditingFromServer = useCallback(async (activityId: string) => {
    const refreshed = await listActivitiesApi();
    setActivities(refreshed);
    const latest = refreshed.find((a) => a.id === activityId) ?? null;
    setEditing(latest);
    if (latest) {
      revokePendingUrls(imageTilesRef.current);
      setImageTiles(imagesToTiles(latest.images));
      setForm({
        title: latest.title,
        theme: latest.theme,
        copywriting: normalizeActivityCopywriting(latest.copywriting || ''),
        status: latest.status,
      });
    }
    return latest;
  }, []);

  const addPendingFiles = (files: FileList | File[]) => {
    const incoming = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (incoming.length === 0) return;
    setImageTiles((prev) => {
      const next: ImageTile[] = [
        ...prev,
        ...incoming.map(
          (file): PendingTile => ({
            kind: 'pending',
            key: crypto.randomUUID(),
            file,
            url: URL.createObjectURL(file),
            name: file.name,
          }),
        ),
      ];
      return next.slice(0, 20);
    });
  };

  const openCreate = () => {
    flushDraft();
    clearActivityDraft(null);
    clearMemorySession();
    revokePendingUrls(imageTilesRef.current);
    setEditing(null);
    setForm(EMPTY_FORM);
    setImageTiles([]);
  };

  const openEdit = (item: Activity) => {
    flushDraft();
    clearActivityDraft(editingRef.current?.id ?? null);
    revokePendingUrls(imageTilesRef.current);
    setEditing(item);
    const copy = normalizeActivityCopywriting(item.copywriting || '');
    setForm({
      title: item.title,
      theme: item.theme,
      copywriting: copy,
      status: item.status,
    });
    setImageTiles(imagesToTiles(item.images));
  };

  /** 指针悬停的目标图（拖到某张图后面） */
  const resolveHoverTargetId = (
    clientX: number,
    clientY: number,
    dragId: string,
  ): string | null => {
    const tiles = imageTilesRef.current;
    for (let i = tiles.length - 1; i >= 0; i--) {
      const id = tileDragId(tiles[i]);
      if (id === dragId) continue;
      const el = document.querySelector(`[data-tile-id="${id}"]`);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (
        clientY >= rect.top &&
        clientY <= rect.bottom &&
        clientX >= rect.left &&
        clientX <= rect.right
      ) {
        return id;
      }
    }
    return null;
  };

  const persistImageOrder = async (tiles: ImageTile[]) => {
    if (!editing) return;
    const uploadedIds = tiles
      .filter((t): t is UploadedTile => t.kind === 'uploaded')
      .map((t) => t.id);
    const unchanged =
      uploadedIds.length === tileOrderBeforeDragRef.current.length &&
      uploadedIds.every((id, i) => id === tileOrderBeforeDragRef.current[i]);
    if (unchanged || uploadedIds.length === 0) return;

    setSavingImageOrder(true);
    try {
      const saved = await reorderActivityImagesApi(editing.id, uploadedIds);
      setEditing(saved);
      const pending = tiles.filter((t) => t.kind === 'pending');
      setImageTiles([...imagesToTiles(saved.images), ...pending]);
      await load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '保存图片顺序失败');
      await syncEditingFromServer(editing.id);
    } finally {
      setSavingImageOrder(false);
    }
  };

  const startTileReorder = (e: React.PointerEvent, dragId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);

    const fromIndex = imageTilesRef.current.findIndex((t) => tileDragId(t) === dragId);
    if (fromIndex < 0) return;

    const tile = imageTilesRef.current[fromIndex];
    const tileEl = document.querySelector(`[data-tile-id="${dragId}"]`) as HTMLElement | null;
    const rect = tileEl?.getBoundingClientRect();

    reorderingRef.current = true;
    setDraggingTileId(dragId);
    setHoverTargetId(null);
    tileOrderBeforeDragRef.current = imageTilesRef.current
      .filter((t) => t.kind === 'uploaded')
      .map((t) => (t as UploadedTile).id);

    lastHoverTargetRef.current = null;

    if (rect) {
      grabOffsetRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      dragMetaRef.current = {
        url: tile.url,
        w: rect.width,
        h: rect.height,
      };
      setDragGhost({
        url: tile.url,
        x: rect.left,
        y: rect.top,
        w: rect.width,
        h: rect.height,
      });
    }

    const onMove = (ev: PointerEvent) => {
      const { url, w, h } = dragMetaRef.current;
      setDragGhost({
        url,
        w,
        h,
        x: ev.clientX - grabOffsetRef.current.x,
        y: ev.clientY - grabOffsetRef.current.y,
      });

      const targetId = resolveHoverTargetId(ev.clientX, ev.clientY, dragId);
      setHoverTargetId(targetId);

      if (!targetId || targetId === lastHoverTargetRef.current) return;
      lastHoverTargetRef.current = targetId;

      setImageTiles((prev) => {
        const from = prev.findIndex((t) => tileDragId(t) === dragId);
        const targetIdx = prev.findIndex((t) => tileDragId(t) === targetId);
        if (from < 0 || targetIdx < 0) return prev;
        const insertIdx = targetIdx + 1;
        if (insertIdx === from || insertIdx === from + 1) return prev;
        const next = reorderAtIndex(prev, from, insertIdx);
        imageTilesRef.current = next;
        return next;
      });
    };

    const onUp = (ev: PointerEvent) => {
      handle.releasePointerCapture(ev.pointerId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      reorderingRef.current = false;
      lastHoverTargetRef.current = null;
      setDraggingTileId(null);
      setHoverTargetId(null);
      setDragGhost(null);
      void persistImageOrder(imageTilesRef.current);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const removeTile = async (tile: ImageTile) => {
    if (tile.kind === 'pending') {
      URL.revokeObjectURL(tile.url);
      setImageTiles((prev) => prev.filter((t) => tileDragId(t) !== tile.key));
      return;
    }
    if (!editing) return;
    await removeActivityImageApi(editing.id, tile.id);
    await syncEditingFromServer(editing.id);
    await load();
  };

  const buildPayload = (status: ActivityStatus): ActivityInput => ({
    ...form,
    status,
    copywriting: normalizeActivityCopywriting(form.copywriting),
  });

  const saveWithStatus = async (status: ActivityStatus) => {
    const payload = buildPayload(status);
    if (!payload.title.trim()) {
      window.alert('活动标题不能为空');
      return;
    }
    setSubmitting(true);
    try {
      let saved: Activity;
      if (editing) {
        saved = await updateActivityApi(editing.id, payload);
      } else {
        saved = await createActivityApi(payload);
      }

      const pending = imageTiles
        .filter((t): t is PendingTile => t.kind === 'pending')
        .map((t) => t.file);
      if (pending.length > 0) {
        saved = await uploadActivityCoverApi(saved.id, pending);
      }

      const latest = await syncEditingFromServer(saved.id);
      if (!latest) {
        setEditing(saved);
        setImageTiles(imagesToTiles(saved.images));
      }
      await load();

      clearActivityDraft(null);
      clearActivityDraft(saved.id);
      clearMemorySession();

      if (status === 'published') {
        window.dispatchEvent(new Event(PUBLISHED_ACTIVITIES_EVENT));
        window.alert('已发布，首页「大使日常互动」已更新');
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '保存活动失败');
    } finally {
      setSubmitting(false);
    }
  };

  const onDropReorder = async () => {
    const nextIds = orderRef.current;
    if (nextIds.length === 0) return;
    setSavingOrder(true);
    try {
      const list = await reorderActivitiesApi(nextIds);
      setActivities(list);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '保存排序失败');
      await load();
    } finally {
      setSavingOrder(false);
    }
  };

  const hasImages = imageTiles.length > 0;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-medium" style={{ color: '#382C25' }}>
          活动管理
        </h2>
        <p className="text-xs mt-1" style={{ color: '#7A6E68' }}>
          保存草稿仅后台可见；「发布到首页」后同步至首页大使日常互动与相册页。编辑内容会自动暂存，离开页面或刷新后可恢复。
        </p>
      </div>

      <div
        className="bg-white rounded-lg border p-5 mb-6"
        style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium" style={{ color: '#382C25' }}>
            {editing ? `编辑活动：${editing.title}` : '新建活动'}
          </h3>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs"
            style={{ borderColor: '#5EC4B6', color: '#5EC4B6' }}
          >
            <Plus className="w-3.5 h-3.5" />
            新建
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <label className="text-xs" style={{ color: '#7A6E68' }}>
            活动标题
            <input
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
              style={{ borderColor: 'rgba(56, 44, 37, 0.15)', color: '#382C25' }}
            />
          </label>
          <div className="text-xs" style={{ color: '#7A6E68' }}>
            <span className="block mb-1">活动文案</span>
            <ActivityCopyEditor
              ref={copyEditorRef}
              resetKey={copyEditorKey}
              value={form.copywriting}
              onChange={(html) => setForm((p) => ({ ...p, copywriting: html }))}
            />
          </div>
        </div>

        <div className="mt-6">
          <p className="text-xs mb-2" style={{ color: '#7A6E68' }}>
            活动图片
          </p>
          <div
            className="rounded-xl border-2 border-dashed p-4 transition-colors"
            style={{
              borderColor: uploadDragActive ? '#5EC4B6' : 'rgba(94, 196, 182, 0.45)',
              backgroundColor: uploadDragActive
                ? 'rgba(94, 196, 182, 0.08)'
                : 'rgba(94, 196, 182, 0.04)',
            }}
            onDragEnter={(e) => {
              if (reorderingRef.current) return;
              if (!e.dataTransfer.types.includes('Files')) return;
              e.preventDefault();
              setUploadDragActive(true);
            }}
            onDragOver={(e) => {
              if (reorderingRef.current) return;
              if (!e.dataTransfer.types.includes('Files')) return;
              e.preventDefault();
              setUploadDragActive(true);
            }}
            onDragLeave={(e) => {
              if (e.currentTarget.contains(e.relatedTarget as Node)) return;
              setUploadDragActive(false);
            }}
            onDrop={(e) => {
              if (reorderingRef.current) return;
              e.preventDefault();
              setUploadDragActive(false);
              if (e.dataTransfer.files?.length) addPendingFiles(e.dataTransfer.files);
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addPendingFiles(e.target.files);
                e.target.value = '';
              }}
            />

            {!hasImages ? (
              <div className="flex flex-col items-center text-center py-6">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
                  style={{ backgroundColor: 'rgba(94, 196, 182, 0.15)' }}
                >
                  <Upload className="w-6 h-6" style={{ color: '#5EC4B6' }} />
                </div>
                <p className="text-sm font-medium mb-1" style={{ color: '#382C25' }}>
                  点击或拖拽上传图片
                </p>
                <p className="text-xs mb-3" style={{ color: '#7A6E68' }}>
                  JPG / PNG / WebP，最多 20 张，单张不超过 20MB
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-white"
                  style={{ backgroundColor: '#5EC4B6' }}
                >
                  <ImagePlus className="w-4 h-4" />
                  选择图片
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs" style={{ color: '#7A6E68' }}>
                    拖动缩略图调整顺序，第一张为封面
                    {savingImageOrder ? ' · 保存顺序中…' : ''}
                  </p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs border"
                    style={{ borderColor: '#5EC4B6', color: '#5EC4B6' }}
                  >
                    <ImagePlus className="w-3.5 h-3.5" />
                    继续添加
                  </button>
                </div>
                <div
                  className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 ${
                    draggingTileId ? '[&>[data-tile-id]]:transition-all [&>[data-tile-id]]:duration-200 [&>[data-tile-id]]:ease-out' : ''
                  }`}
                >
                  {imageTiles.map((tile, index) => {
                    const id = tileDragId(tile);
                    const isDragging = draggingTileId === id;
                    const isHoverTarget = hoverTargetId === id && !isDragging;

                    return (
                      <div
                        key={id}
                        data-tile-id={id}
                        className="relative rounded-lg border overflow-hidden bg-white select-none"
                        style={{
                          borderColor: isHoverTarget
                            ? '#5EC4B6'
                            : 'rgba(56, 44, 37, 0.12)',
                          transform: isHoverTarget ? 'scale(1.03)' : 'scale(1)',
                          boxShadow: isHoverTarget
                            ? '0 2px 8px rgba(94, 196, 182, 0.2)'
                            : undefined,
                          transition:
                            'transform 0.2s ease-out, box-shadow 0.2s ease-out, border-color 0.15s ease',
                        }}
                      >
                        {isDragging ? (
                          <div
                            className="h-24 rounded-md border border-dashed flex items-center justify-center"
                            style={{
                              borderColor: 'rgba(94, 196, 182, 0.35)',
                              backgroundColor: 'rgba(94, 196, 182, 0.06)',
                            }}
                          />
                        ) : (
                          <>
                            <div className="absolute top-1 left-1 z-10 flex items-center gap-1">
                              <button
                                type="button"
                                disabled={savingImageOrder}
                                onPointerDown={(e) => startTileReorder(e, id)}
                                className="p-1.5 rounded cursor-grab active:cursor-grabbing active:scale-95 bg-white/95 shadow-sm touch-none transition-transform"
                                title="按住拖动排序"
                              >
                                <GripVertical
                                  className="w-3.5 h-3.5"
                                  style={{ color: '#7A6E68' }}
                                />
                              </button>
                              {index === 0 && (
                                <span
                                  className="text-[10px] px-1.5 py-0.5 rounded"
                                  style={{ backgroundColor: '#5EC4B6', color: 'white' }}
                                >
                                  封面
                                </span>
                              )}
                            </div>
                            <img
                              src={tile.url}
                              alt={tile.name}
                              draggable={false}
                              className="w-full h-24 object-cover pointer-events-none"
                            />
                            <button
                              type="button"
                              title="删除"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                void removeTile(tile);
                              }}
                              className="absolute top-1 right-1 p-1.5 rounded bg-white/95 shadow-sm z-10 hover:bg-white transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" style={{ color: '#E85D75' }} />
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center h-24 rounded-lg border-2 border-dashed"
                    style={{
                      borderColor: 'rgba(94, 196, 182, 0.4)',
                      color: '#5EC4B6',
                      backgroundColor: 'rgba(94, 196, 182, 0.06)',
                    }}
                  >
                    <Plus className="w-5 h-5 mb-1" />
                    <span className="text-xs">添加</span>
                  </button>
                </div>
              </>
            )}
            {dragGhost && (
              <div
                className="fixed z-[200] pointer-events-none rounded-lg overflow-hidden"
                style={{
                  left: dragGhost.x,
                  top: dragGhost.y,
                  width: dragGhost.w,
                  height: dragGhost.h,
                  transform: 'scale(1.05) rotate(-1deg)',
                  boxShadow: '0 12px 28px rgba(56, 44, 37, 0.18)',
                  outline: '2px solid rgba(94, 196, 182, 0.85)',
                  outlineOffset: 0,
                  transition: 'box-shadow 0.15s ease',
                  willChange: 'left, top',
                }}
              >
                <img
                  src={dragGhost.url}
                  alt=""
                  draggable={false}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={submitting}
            onClick={() => void saveWithStatus('draft')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded text-sm border disabled:opacity-60"
            style={{ borderColor: '#5EC4B6', color: '#5EC4B6' }}
          >
            <Save className="w-4 h-4" />
            {submitting ? '保存中…' : '保存草稿'}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void saveWithStatus('published')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded text-sm text-white disabled:opacity-60"
            style={{ backgroundColor: '#5EC4B6' }}
          >
            {submitting ? '发布中…' : '发布到首页'}
          </button>
          <span className="text-xs" style={{ color: '#7A6E68' }}>
            当前：
            {editing?.status === 'published' || form.status === 'published'
              ? '已发布（首页可见）'
              : '草稿（仅后台可见）'}
          </span>
        </div>
      </div>

      <div
        className="bg-white rounded-lg border overflow-hidden"
        style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
      >
        {loading ? (
          <p className="text-sm text-center py-10" style={{ color: '#7A6E68' }}>
            加载中…
          </p>
        ) : (
          <table className="w-full">
            <thead style={{ backgroundColor: '#F5F5F5' }}>
              <tr>
                <th className="px-3 py-3 w-10" />
                <th className="px-4 py-3 text-left text-xs" style={{ color: '#7A6E68' }}>
                  活动
                </th>
                <th className="px-4 py-3 text-left text-xs" style={{ color: '#7A6E68' }}>
                  图片
                </th>
                <th className="px-4 py-3 text-left text-xs" style={{ color: '#7A6E68' }}>
                  状态
                </th>
                <th className="px-4 py-3 text-left text-xs" style={{ color: '#7A6E68' }}>
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {orderedActivities.map((item) => (
                <tr
                  key={item.id}
                  className="border-t"
                  style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    const fromId = draggingIdRef.current;
                    if (!fromId || fromId === item.id) return;
                    setActivities((prev) => {
                      const next = [...prev];
                      const fromIdx = next.findIndex((a) => a.id === fromId);
                      const toIdx = next.findIndex((a) => a.id === item.id);
                      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return prev;
                      const [moved] = next.splice(fromIdx, 1);
                      next.splice(toIdx, 0, moved);
                      orderRef.current = next.map((a) => a.id);
                      return next;
                    });
                  }}
                >
                  <td className="px-3 py-3">
                    <span
                      draggable={!savingOrder}
                      onDragStart={() => {
                        draggingIdRef.current = item.id;
                        orderRef.current = orderedActivities.map((a) => a.id);
                      }}
                      onDragEnd={() => {
                        draggingIdRef.current = null;
                        void onDropReorder();
                      }}
                      className="inline-flex cursor-grab"
                    >
                      <GripVertical className="w-4 h-4" style={{ color: '#7A6E68' }} />
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium" style={{ color: '#382C25' }}>
                      {item.title}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {item.images.length > 0 ? (
                      <div className="flex items-center gap-2">
                        <img
                          src={item.images[0].imageUrl}
                          alt={item.title}
                          className="w-20 h-12 object-cover rounded border"
                          style={{ borderColor: 'rgba(56, 44, 37, 0.1)' }}
                        />
                        <span className="text-xs" style={{ color: '#7A6E68' }}>
                          共 {item.images.length} 张
                        </span>
                      </div>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1.5 text-xs"
                        style={{ color: '#7A6E68' }}
                      >
                        <ImagePlus className="w-3.5 h-3.5" />
                        无图片
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: '#7A6E68' }}>
                    {item.status === 'published' ? '已发布' : '草稿'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        className="px-2.5 py-1 text-xs rounded border"
                        style={{ borderColor: '#5EC4B6', color: '#5EC4B6' }}
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.confirm(`确认删除活动「${item.title}」？`)) return;
                          await deleteActivityApi(item.id);
                          await load();
                          if (editing?.id === item.id) openCreate();
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded border"
                        style={{ borderColor: '#E85D75', color: '#E85D75' }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && orderedActivities.length === 0 && (
          <p className="text-sm text-center py-10" style={{ color: '#7A6E68' }}>
            暂无活动，先创建第一条活动内容。
          </p>
        )}
      </div>
    </div>
  );
}
