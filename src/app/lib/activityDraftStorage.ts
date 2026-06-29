import type { ActivityInput } from '../types/activity';
import { readMemorySession } from './activityEditorSession';

const PREFIX = 'ambassador-activity-draft';
const ACTIVE_KEY = `${PREFIX}:active`;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type StoredActivityDraft = {
  editingId: string | null;
  form: ActivityInput;
  updatedAt: number;
};

export function draftStorageKey(editingId: string | null): string {
  return editingId ? `${PREFIX}:${editingId}` : `${PREFIX}:new`;
}

export function hasMeaningfulDraft(
  form: ActivityInput,
  editingId: string | null,
): boolean {
  const text = (form.copywriting || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim();
  return Boolean(form.title.trim() || form.theme.trim() || text || editingId);
}

export function saveActivityDraft(draft: StoredActivityDraft): void {
  if (!hasMeaningfulDraft(draft.form, draft.editingId)) return;
  const key = draftStorageKey(draft.editingId);
  try {
    localStorage.setItem(key, JSON.stringify(draft));
    localStorage.setItem(ACTIVE_KEY, key);
  } catch {
    /* quota / private mode */
  }
}

/** 内存会话与 localStorage 中取较新的一份（切换模块/刷新后恢复用） */
export function loadMergedActivitySession(): StoredActivityDraft | null {
  const mem = readMemorySession();
  const stored = loadActiveActivityDraft();
  if (mem && stored) {
    return mem.updatedAt >= stored.updatedAt ? mem : stored;
  }
  return mem ?? stored;
}

export function loadActiveActivityDraft(): StoredActivityDraft | null {
  try {
    const activeKey = localStorage.getItem(ACTIVE_KEY);
    if (!activeKey) return null;
    const raw = localStorage.getItem(activeKey);
    if (!raw) return null;
    const draft = JSON.parse(raw) as StoredActivityDraft;
    if (!draft?.form || typeof draft.updatedAt !== 'number') return null;
    if (Date.now() - draft.updatedAt > MAX_AGE_MS) {
      clearActivityDraft(draft.editingId);
      return null;
    }
    if (!hasMeaningfulDraft(draft.form, draft.editingId)) return null;
    return draft;
  } catch {
    return null;
  }
}

export function clearActivityDraft(editingId: string | null): void {
  try {
    const key = draftStorageKey(editingId);
    localStorage.removeItem(key);
    if (localStorage.getItem(ACTIVE_KEY) === key) {
      localStorage.removeItem(ACTIVE_KEY);
    }
  } catch {
    /* ignore */
  }
}
