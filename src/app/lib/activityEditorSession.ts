import type { ActivityInput } from '../types/activity';

/** 管理端活动编辑：内存会话（切换标签/路由时组件卸载仍可恢复） */
export type ActivityEditorSession = {
  editingId: string | null;
  form: ActivityInput;
  updatedAt: number;
};

let memorySession: ActivityEditorSession | null = null;

export const ACTIVITY_FLUSH_DRAFT_EVENT = 'admin-activity-flush-draft';

export function readMemorySession(): ActivityEditorSession | null {
  return memorySession;
}

export function writeMemorySession(session: ActivityEditorSession): void {
  memorySession = session;
}

export function clearMemorySession(): void {
  memorySession = null;
}

export function dispatchFlushActivityDraft(): void {
  window.dispatchEvent(new Event(ACTIVITY_FLUSH_DRAFT_EVENT));
}
