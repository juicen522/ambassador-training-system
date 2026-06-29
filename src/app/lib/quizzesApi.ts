import { apiFetch, getToken } from './api';
import type {
  QuizAttemptReport,
  QuizBank,
  QuizBankInput,
  QuizBankType,
  QuizQuestion,
  QuizQuestionInput,
  QuizImportFile,
  QuizTakePayload,
  WeeklyReleaseHistoryItem,
} from '../types/quiz';

function normalizeBank(raw: QuizBank): QuizBank {
  return {
    id: raw.id,
    type: raw.type,
    title: raw.title,
    description: raw.description ?? '',
    passPercent: raw.passPercent ?? 60,
    questionLimit: raw.questionLimit ?? 0,
    timeLimitMinutes: raw.timeLimitMinutes ?? 0,
    status: raw.status === 'published' ? 'published' : 'draft',
    sortOrder: raw.sortOrder ?? 0,
    questionCount: raw.questionCount,
    weeklySchedule: raw.weeklySchedule,
    weeklyReleaseStatus: raw.weeklyReleaseStatus,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export async function updateWeeklyScheduleApi(
  bankId: string,
  schedule: {
    publishWeekday: number;
    publishTime: string;
    endWeekday: number;
    endTime: string;
  },
): Promise<QuizBank> {
  const data = await apiFetch(`/quizzes/admin/weekly/schedule/${bankId}`, {
    method: 'PUT',
    body: JSON.stringify(schedule),
  });
  return normalizeBank(data.bank);
}

export async function listWeeklyReleaseHistoryApi(
  bankId: string,
): Promise<WeeklyReleaseHistoryItem[]> {
  const data = await apiFetch(`/quizzes/admin/weekly/history?bankId=${encodeURIComponent(bankId)}`);
  return data.history as WeeklyReleaseHistoryItem[];
}

function normalizeQuestion(raw: QuizQuestion): QuizQuestion {
  return {
    id: raw.id,
    bankId: raw.bankId,
    question: raw.question,
    options: raw.options ?? [],
    correctIndex: raw.correctIndex,
    correctIndexes: raw.correctIndexes ?? [],
    answerText: raw.answerText ?? '',
    questionType: raw.questionType ?? 'single',
    score: raw.score ?? 1,
    category: raw.category ?? '',
    sortOrder: raw.sortOrder ?? 0,
    enabled: raw.enabled !== false,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export async function listQuizBanksAdminApi(type?: QuizBankType): Promise<QuizBank[]> {
  const qs = type ? `?type=${type}` : '';
  const data = await apiFetch(`/quizzes/admin/banks${qs}`);
  return (data.banks as QuizBank[]).map(normalizeBank);
}

export async function createQuizBankApi(input: QuizBankInput): Promise<QuizBank> {
  const data = await apiFetch('/quizzes/admin/banks', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return normalizeBank(data.bank);
}

export async function updateQuizBankApi(
  id: string,
  input: Partial<QuizBankInput>,
): Promise<QuizBank> {
  const data = await apiFetch(`/quizzes/admin/banks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  return normalizeBank(data.bank);
}

export async function deleteQuizBankApi(id: string): Promise<void> {
  await apiFetch(`/quizzes/admin/banks/${id}`, { method: 'DELETE' });
}

export async function listQuizQuestionsAdminApi(bankId: string): Promise<QuizQuestion[]> {
  const data = await apiFetch(`/quizzes/admin/banks/${bankId}/questions`);
  return (data.questions as QuizQuestion[]).map(normalizeQuestion);
}

export async function createQuizQuestionApi(
  bankId: string,
  input: QuizQuestionInput,
): Promise<QuizQuestion> {
  const data = await apiFetch(`/quizzes/admin/banks/${bankId}/questions`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return normalizeQuestion(data.question);
}

export async function updateQuizQuestionApi(
  id: string,
  input: Partial<QuizQuestionInput>,
): Promise<QuizQuestion> {
  const data = await apiFetch(`/quizzes/admin/questions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  return normalizeQuestion(data.question);
}

export async function deleteQuizQuestionApi(id: string): Promise<void> {
  await apiFetch(`/quizzes/admin/questions/${id}`, { method: 'DELETE' });
}

export async function batchDeleteQuizQuestionsApi(
  bankId: string,
  questionIds: string[],
): Promise<{ ok: boolean; deleted: number }> {
  return apiFetch(`/quizzes/admin/banks/${bankId}/questions/batch-delete`, {
    method: 'POST',
    body: JSON.stringify({ questionIds }),
  });
}

export async function clearQuizQuestionsApi(
  bankId: string,
): Promise<{ ok: boolean; deleted: number }> {
  return apiFetch(`/quizzes/admin/banks/${bankId}/questions/batch-delete`, {
    method: 'POST',
    body: JSON.stringify({ all: true }),
  });
}

export async function fetchQuizImportAiStatusApi(): Promise<{
  available: boolean;
  model: string | null;
}> {
  return apiFetch('/quizzes/admin/import-ai-status');
}

export async function downloadQuizImportTemplateApi(): Promise<void> {
  const token = getToken();
  const res = await fetch('/api/quizzes/admin/import-template', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let message = `下载失败（${res.status}）`;
    try {
      const data = await res.json();
      if (data.error) message = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = '题库导入模板.xlsx';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function syncQuizToExamsApi(bankId: string): Promise<{
  ok: boolean;
  questionCount: number;
  weeklyCount: number;
  knowledgeCount: number;
  knowledgeExamLimit: number;
  weeklyTitle: string;
  knowledgeTitle: string;
}> {
  return apiFetch(`/quizzes/admin/banks/${bankId}/sync-exams`, { method: 'POST' });
}

export async function importQuizQuestionsFileApi(
  bankId: string,
  file: File,
): Promise<{
  ok: boolean;
  imported: number;
  parsedRows?: number;
  skippedRows?: number;
  parseMode?: 'ai';
  aiAvailable?: boolean;
  sampleReasons?: Array<{ row: number; question?: string; reason: string }>;
  sync?: {
    questionCount: number;
    knowledgeExamLimit: number;
  };
  hint?: string;
}> {
  const form = new FormData();
  form.append('file', file);
  return apiFetch(`/quizzes/admin/banks/${bankId}/import`, {
    method: 'POST',
    body: form,
  });
}

export async function listQuizImportFilesApi(bankId: string): Promise<QuizImportFile[]> {
  const data = await apiFetch(`/quizzes/admin/banks/${bankId}/import-files`);
  return (data.files as QuizImportFile[]) ?? [];
}

export async function deleteQuizImportFileApi(id: string): Promise<void> {
  await apiFetch(`/quizzes/admin/import-files/${id}`, { method: 'DELETE' });
}

export async function batchDeleteQuizImportFilesApi(
  ids: string[],
): Promise<{ ok: boolean; deleted: number }> {
  return apiFetch('/quizzes/admin/import-files/batch-delete', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
}

export async function fetchQuizTakeApi(
  type: QuizBankType,
  bankId?: string,
): Promise<QuizTakePayload> {
  const qs = bankId ? `?bankId=${encodeURIComponent(bankId)}` : '';
  return apiFetch(`/quizzes/take/${type}${qs}`);
}

export async function fetchQuizPreviewApi(
  type: QuizBankType,
  bankId: string,
): Promise<QuizTakePayload> {
  const qs = `?bankId=${encodeURIComponent(bankId)}`;
  return apiFetch(`/quizzes/admin/preview/${type}${qs}`);
}

export async function listPublishedWeeklyBanksApi(): Promise<QuizBank[]> {
  const data = await apiFetch('/quizzes/published/weekly');
  return (data.banks as QuizBank[]).map(normalizeBank);
}

export async function listPublishedKnowledgeBanksApi(): Promise<QuizBank[]> {
  const data = await apiFetch('/quizzes/published/knowledge');
  return (data.banks as QuizBank[]).map(normalizeBank);
}

export interface QuizSubmitResult {
  score: number;
  total: number;
  percent: number;
  passed: boolean;
  passPercent: number;
  details: {
    questionId: string;
    correct: boolean;
    questionType?: 'single' | 'multiple' | 'boolean' | 'text';
    score?: number;
    correctIndex?: number;
    correctIndexes?: number[];
    answerText?: string;
    skipped?: boolean;
  }[];
}

export async function submitQuizApi(
  bankId: string,
  answers: {
    questionId: string;
    selectedIndex?: number;
    selectedIndexes?: number[];
    textAnswer?: string;
  }[],
): Promise<QuizSubmitResult> {
  return apiFetch('/quizzes/submit', {
    method: 'POST',
    body: JSON.stringify({ bankId, answers }),
  });
}

export async function listQuizAttemptReportsApi(params: {
  type: QuizBankType;
  search?: string;
  from?: string;
  to?: string;
  userId?: string;
}): Promise<QuizAttemptReport[]> {
  const qs = new URLSearchParams({ type: params.type });
  if (params.search) qs.set('search', params.search);
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.userId) qs.set('userId', params.userId);
  const data = await apiFetch(`/quizzes/admin/reports?${qs.toString()}`);
  return (data.reports as QuizAttemptReport[]) ?? [];
}

export async function downloadQuizAttemptReportsApi(params: {
  type: QuizBankType;
  search?: string;
  from?: string;
  to?: string;
  userId?: string;
}): Promise<void> {
  const qs = new URLSearchParams({ type: params.type });
  if (params.search) qs.set('search', params.search);
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.userId) qs.set('userId', params.userId);
  const token = getToken();
  const res = await fetch(`/api/quizzes/admin/reports/export?${qs.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let message = `下载失败（${res.status}）`;
    try {
      const data = await res.json();
      if (data.error) message = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const stamp = new Date().toISOString().slice(0, 10);
  const filename =
    params.type === 'weekly' ? `周测报告_${stamp}.xlsx` : `培训测试报告_${stamp}.xlsx`;
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const downloadName = match ? decodeURIComponent(match[1]) : filename;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = downloadName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function submitQuizPreviewApi(
  bankId: string,
  answers: {
    questionId: string;
    selectedIndex?: number;
    selectedIndexes?: number[];
    textAnswer?: string;
  }[],
): Promise<QuizSubmitResult> {
  return apiFetch('/quizzes/admin/preview/submit', {
    method: 'POST',
    body: JSON.stringify({ bankId, answers }),
  });
}
