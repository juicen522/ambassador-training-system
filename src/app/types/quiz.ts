export type QuizBankType = 'knowledge' | 'weekly';
export type QuizBankStatus = 'draft' | 'published';
export type QuizQuestionType = 'single' | 'multiple' | 'boolean' | 'text';

export interface QuizBank {
  id: string;
  type: QuizBankType;
  title: string;
  description: string;
  passPercent: number;
  questionLimit: number;
  timeLimitMinutes: number;
  status: QuizBankStatus;
  sortOrder: number;
  questionCount?: number;
  weeklySchedule?: {
    publishWeekday: number;
    publishTime: string;
    endWeekday: number;
    endTime: string;
  };
  weeklyReleaseStatus?: 'upcoming' | 'active' | 'ended';
  createdAt?: string;
  updatedAt?: string;
}

export interface QuizBankInput {
  type: QuizBankType;
  title: string;
  description?: string;
  passPercent?: number;
  questionLimit?: number;
  timeLimitMinutes?: number;
  status?: QuizBankStatus;
  sortOrder?: number;
  weeklySchedule?: {
    publishWeekday: number;
    publishTime: string;
    endWeekday: number;
    endTime: string;
  };
}

export interface WeeklyReleaseHistoryItem {
  weekStartDate: string;
  publishedAt: string;
  endedAt: string;
  status: 'upcoming' | 'active' | 'ended';
  createdAt?: string;
  updatedAt?: string;
}

export interface QuizQuestion {
  id: string;
  bankId: string;
  question: string;
  options: string[];
  correctIndex: number;
  correctIndexes?: number[];
  answerText?: string;
  questionType?: QuizQuestionType;
  score?: number;
  category: string;
  sortOrder: number;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface QuizQuestionInput {
  question: string;
  options: string[];
  correctIndex: number;
  correctIndexes?: number[];
  answerText?: string;
  questionType?: QuizQuestionType;
  score?: number;
  category?: string;
  sortOrder?: number;
  enabled?: boolean;
}

/** 学员答题卷（无正确答案） */
export interface QuizTakeQuestion {
  id: string;
  question: string;
  options: string[];
  questionType?: QuizQuestionType;
  score?: number;
  category: string;
}

export interface QuizTakePayload {
  bank: {
    id: string;
    type: QuizBankType;
    title: string;
    description: string;
    passPercent: number;
    timeLimitMinutes: number;
    questionCount: number;
  };
  questions: QuizTakeQuestion[];
}

export interface QuizImportFile {
  id: string;
  bankId: string;
  originalName: string;
  storagePath: string;
  mimeType: string;
  fileSize: number;
  importedCount: number;
  skippedCount: number;
  createdAt: string;
}

export interface QuizAttemptReport {
  id: string;
  userId: string;
  userName: string;
  username: string;
  role: string;
  roleLabel: string;
  managerName: string | null;
  bankId: string;
  bankType: QuizBankType;
  bankTitle: string;
  score: number;
  totalScore: number;
  percent: number;
  passed: boolean;
  questionCount: number;
  correctCount: number;
  weekStartDate: string | null;
  submittedAt: string;
}

/** 前端答题用 */
export interface ClientQuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  category?: string;
}
