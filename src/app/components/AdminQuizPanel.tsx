import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { Plus, Save, Trash2, HelpCircle, BookOpenCheck, Eye, RefreshCw } from 'lucide-react';
import type {
  QuizBank,
  QuizImportFile,
  QuizBankType,
  QuizQuestion,
  QuizQuestionInput,
  WeeklyReleaseHistoryItem,
} from '../types/quiz';
import {
  batchDeleteQuizImportFilesApi,
  batchDeleteQuizQuestionsApi,
  createQuizQuestionApi,
  deleteQuizBankApi,
  deleteQuizImportFileApi,
  deleteQuizQuestionApi,
  downloadQuizImportTemplateApi,
  fetchQuizImportAiStatusApi,
  importQuizQuestionsFileApi,
  syncQuizToExamsApi,
  listQuizImportFilesApi,
  listQuizBanksAdminApi,
  listQuizQuestionsAdminApi,
  listWeeklyReleaseHistoryApi,
  updateWeeklyScheduleApi,
  updateQuizBankApi,
  updateQuizQuestionApi,
} from '../lib/quizzesApi';

const EMPTY_QUESTION: QuizQuestionInput = {
  question: '',
  options: ['', '', '', ''],
  correctIndex: 0,
  correctIndexes: [],
  questionType: 'single',
  answerText: '',
  score: 1,
  category: '',
  enabled: true,
};

/** 题目列表工具栏按钮统一尺寸 */
const LIST_TOOLBAR_BTN =
  'inline-flex items-center justify-center gap-1 h-8 px-3 rounded-lg text-xs font-medium whitespace-nowrap disabled:opacity-60';

export default function AdminQuizPanel() {
  const { publicSettings } = useSettings();
  const [typeTab, setTypeTab] = useState<QuizBankType>('weekly');
  const [banks, setBanks] = useState<QuizBank[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [weeklyMainView, setWeeklyMainView] = useState<'exam' | 'publish'>('exam');
  const [weeklyHistory, setWeeklyHistory] = useState<WeeklyReleaseHistoryItem[]>([]);
  const [weeklyStatus, setWeeklyStatus] = useState<'upcoming' | 'active' | 'ended' | ''>('');
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [weeklyPanel, setWeeklyPanel] = useState<'schedule' | 'history'>('schedule');
  const [weeklySchedule, setWeeklySchedule] = useState({
    publishWeekday: 1,
    publishTime: '08:30',
    endWeekday: 5,
    endTime: '17:30',
  });

  const [bankForm, setBankForm] = useState({
    title: '',
    description: '',
    passPercent: 60,
    questionLimit: 0,
    timeLimitMinutes: 0,
    status: 'draft' as 'draft' | 'published',
    sortOrder: 0,
  });

  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [questionForm, setQuestionForm] = useState<QuizQuestionInput>(EMPTY_QUESTION);
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [importDiagnostics, setImportDiagnostics] = useState<
    Array<{ row: number; question?: string; reason: string }>
  >([]);
  const [showImportGuide, setShowImportGuide] = useState(false);
  const [aiImportStatus, setAiImportStatus] = useState<{
    available: boolean;
    model: string | null;
  } | null>(null);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [importFiles, setImportFiles] = useState<QuizImportFile[]>([]);
  const [selectedImportFileIds, setSelectedImportFileIds] = useState<string[]>([]);
  const [deletingImportFiles, setDeletingImportFiles] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const selectedBank = banks.find((b) => b.id === selectedId) ?? null;
  const selectedBankPublished = selectedBank?.status === 'published';

  const loadBanks = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await listQuizBanksAdminApi(typeTab);
      setBanks(list);
      setSelectedId((prev) => {
        if (prev && list.some((b) => b.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载题库失败');
    } finally {
      setLoading(false);
    }
  }, [typeTab]);

  const loadQuestions = useCallback(async (bankId: string) => {
    try {
      const list = await listQuizQuestionsAdminApi(bankId);
      setQuestions(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载题目失败');
    }
  }, []);

  const loadImportFiles = useCallback(async (bankId: string) => {
    try {
      const rows = await listQuizImportFilesApi(bankId);
      setImportFiles(rows);
      setSelectedImportFileIds([]);
    } catch {
      setImportFiles([]);
    }
  }, []);

  useEffect(() => {
    loadBanks();
  }, [loadBanks]);

  useEffect(() => {
    fetchQuizImportAiStatusApi()
      .then(setAiImportStatus)
      .catch(() => setAiImportStatus(null));
  }, []);

  /** 与知识库 AI 共用配置；状态接口 404 时仍以公开配置为准 */
  const aiImportReady = useMemo(
    () => publicSettings.aiConfigured || aiImportStatus?.available === true,
    [publicSettings.aiConfigured, aiImportStatus],
  );

  useEffect(() => {
    if (!selectedBank) {
      setQuestions([]);
      return;
    }
    setBankForm({
      title: selectedBank.title,
      description: selectedBank.description,
      passPercent: selectedBank.passPercent,
      questionLimit: selectedBank.questionLimit,
      timeLimitMinutes: selectedBank.timeLimitMinutes,
      status: selectedBank.status,
      sortOrder: selectedBank.sortOrder,
    });
    loadQuestions(selectedBank.id);
    loadImportFiles(selectedBank.id);
    setSelectedQuestionIds([]);
    if (selectedBank.type === 'weekly') {
      setWeeklyMainView('exam');
      setWeeklyPanel('schedule');
      setWeeklySchedule(
        selectedBank.weeklySchedule ?? {
          publishWeekday: 1,
          publishTime: '08:30',
          endWeekday: 5,
          endTime: '17:30',
        },
      );
      setWeeklyStatus(selectedBank.weeklyReleaseStatus ?? '');
      listWeeklyReleaseHistoryApi(selectedBank.id)
        .then((rows) => setWeeklyHistory(rows))
        .catch(() => setWeeklyHistory([]));
    } else {
      setWeeklyHistory([]);
      setWeeklyStatus('');
    }
  }, [selectedBank, loadImportFiles, loadQuestions]);

  const flash = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(''), 2500);
  };

  const handleSaveBank = async () => {
    if (!selectedId) return;
    setSaving(true);
    setError('');
    try {
      await updateQuizBankApi(selectedId, bankForm);
      await loadBanks();
      flash('题库已保存');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBank = async () => {
    if (!selectedId || !selectedBank) return;
    if (!window.confirm(`确定删除「${selectedBank.title}」及全部题目？`)) return;
    setSaving(true);
    setError('');
    try {
      await deleteQuizBankApi(selectedId);
      setSelectedId(null);
      await loadBanks();
      flash('已删除题库');
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setSaving(false);
    }
  };

  const openNewQuestion = () => {
    setEditingQuestionId(null);
    setQuestionForm({ ...EMPTY_QUESTION, options: ['', '', '', ''] });
    setShowQuestionForm(true);
  };

  const openEditQuestion = (q: QuizQuestion) => {
    setEditingQuestionId(q.id);
    setQuestionForm({
      question: q.question,
      options: [...q.options],
      correctIndex: q.correctIndex,
      correctIndexes: q.correctIndexes ?? [],
      questionType: q.questionType ?? 'single',
      answerText: q.answerText ?? '',
      score: q.score ?? 1,
      category: q.category,
      enabled: q.enabled,
    });
    setShowQuestionForm(true);
  };

  const handleSaveQuestion = async () => {
    if (!selectedId) return;
    const opts = questionForm.options.map((o) => o.trim()).filter(Boolean);
    const qType = questionForm.questionType ?? 'single';
    if (!questionForm.question.trim()) {
      setError('请填写题目内容');
      return;
    }
    if (qType !== 'text' && opts.length < 2) {
      setError('至少需要 2 个有效选项');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...questionForm,
        options: qType === 'text' ? [] : opts,
        correctIndex:
          qType === 'text'
            ? -1
            : Math.min(questionForm.correctIndex, Math.max(0, opts.length - 1)),
        correctIndexes:
          qType === 'multiple'
            ? (questionForm.correctIndexes ?? []).filter((i) => i < opts.length)
            : [],
        score: Math.max(1, Number(questionForm.score) || 1),
      };
      if (editingQuestionId) {
        await updateQuizQuestionApi(editingQuestionId, payload);
      } else {
        await createQuizQuestionApi(selectedId, payload);
      }
      await loadQuestions(selectedId);
      await loadBanks();
      setShowQuestionForm(false);
      flash(editingQuestionId ? '题目已更新' : '题目已添加');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存题目失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    if (!window.confirm('确定删除该题目？')) return;
    setSaving(true);
    try {
      await deleteQuizQuestionApi(id);
      if (selectedId) await loadQuestions(selectedId);
      await loadBanks();
      setSelectedQuestionIds((prev) => prev.filter((x) => x !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除题目失败');
    } finally {
      setSaving(false);
    }
  };

  const handleImportQuestions = async (file: File) => {
    if (!selectedId) {
      setError('请先选择题库');
      return;
    }
    if (typeTab === 'weekly' && weeklyMainView === 'publish') {
      setWeeklyMainView('exam');
      setError('已切换到「试卷设置」。请再次点击「上传并导入」选择文件。');
      return;
    }
    const ext = file.name.includes('.')
      ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
      : '';
    const allowed = ['.docx', '.xlsx', '.xls', '.csv'];
    if (!allowed.includes(ext)) {
      setError(
        `「${file.name}」格式不支持（${ext || '无后缀'}）。请使用 .docx / .xlsx / .xls / .csv；老版 Word .doc 请先另存为 .docx。`,
      );
      return;
    }
    if (!aiImportReady) {
      setError('题库导入需要 AI。请先在「培训管理 → 配置管理」填写 API Key 并保存。');
      return;
    }
    setImporting(true);
    setError('');
    try {
      const data = await importQuizQuestionsFileApi(selectedId, file);
      await loadQuestions(selectedId);
      await loadImportFiles(selectedId);
      await loadBanks();
      setImportDiagnostics(data.sampleReasons ?? []);
      const skipped = Math.max(0, Number(data.skippedRows || 0));
      if (skipped > 0) {
        const firstReason = data.sampleReasons?.[0];
        flash(
          `「${file.name}」AI 已导入 ${data.imported} 道，跳过 ${skipped} 道${
            firstReason ? `（示例：第${firstReason.row}行 ${firstReason.reason}）` : ''
          }。请展开「导入说明」查看详情。`,
        );
      } else {
        setImportDiagnostics([]);
        flash(
          data.sync
            ? `「${file.name}」已导入 ${data.imported} 道题，并同步至周测与培训测试（${data.sync.questionCount} 题）`
            : `「${file.name}」AI 已导入 ${data.imported} 道题`,
        );
      }
      if (data.sync) {
        await loadBanks();
        const weeklyBank = (await listQuizBanksAdminApi('weekly')).find((b) => b.status === 'published');
        const knowledgeBank = (await listQuizBanksAdminApi('knowledge')).find(
          (b) => b.status === 'published',
        );
        if (typeTab === 'weekly' && weeklyBank) {
          setSelectedId(weeklyBank.id);
          await loadQuestions(weeklyBank.id);
        } else if (typeTab === 'knowledge' && knowledgeBank) {
          setSelectedId(knowledgeBank.id);
          await loadQuestions(knowledgeBank.id);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '导入失败';
      setError(`「${file.name}」：${msg}`);
      if (selectedId) await loadImportFiles(selectedId);
    } finally {
      setImporting(false);
    }
  };

  const toggleQuestionSelect = (id: string, checked: boolean) => {
    setSelectedQuestionIds((prev) => {
      const set = new Set(prev);
      if (checked) set.add(id);
      else set.delete(id);
      return [...set];
    });
  };

  const toggleAllQuestions = (checked: boolean) => {
    if (checked) {
      setSelectedQuestionIds(questions.map((q) => q.id));
    } else {
      setSelectedQuestionIds([]);
    }
  };

  const handleSyncToExams = async () => {
    if (!selectedId) return;
    if (
      !window.confirm(
        '将把当前题库的全部题目覆盖同步到「已发布的周测卷」和「已发布的培训测试卷」，是否继续？',
      )
    ) {
      return;
    }
    setSyncing(true);
    setError('');
    try {
      const result = await syncQuizToExamsApi(selectedId);
      await loadBanks();
      const weeklyBank = (await listQuizBanksAdminApi('weekly')).find((b) => b.status === 'published');
      const knowledgeBank = (await listQuizBanksAdminApi('knowledge')).find(
        (b) => b.status === 'published',
      );
      if (typeTab === 'weekly' && weeklyBank) {
        setSelectedId(weeklyBank.id);
        await loadQuestions(weeklyBank.id);
      } else if (typeTab === 'knowledge' && knowledgeBank) {
        setSelectedId(knowledgeBank.id);
        await loadQuestions(knowledgeBank.id);
      }
      flash(
        `已同步 ${result.questionCount} 道题至「${result.weeklyTitle}」与「${result.knowledgeTitle}」（培训测试每次 ${result.knowledgeExamLimit} 题）`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '同步失败');
    } finally {
      setSyncing(false);
    }
  };

  const handleBatchDeleteQuestions = async () => {
    if (!selectedId || selectedQuestionIds.length === 0) return;
    if (!window.confirm(`确定删除选中的 ${selectedQuestionIds.length} 道题目？`)) return;
    setSaving(true);
    setError('');
    try {
      await batchDeleteQuizQuestionsApi(selectedId, selectedQuestionIds);
      await loadQuestions(selectedId);
      await loadBanks();
      setSelectedQuestionIds([]);
      flash('已批量删除题目');
    } catch (err) {
      setError(err instanceof Error ? err.message : '批量删除失败');
    } finally {
      setSaving(false);
    }
  };

  const toggleImportFileSelect = (id: string, checked: boolean) => {
    setSelectedImportFileIds((prev) => {
      const set = new Set(prev);
      if (checked) set.add(id);
      else set.delete(id);
      return [...set];
    });
  };

  const toggleAllImportFiles = (checked: boolean) => {
    if (checked) setSelectedImportFileIds(importFiles.map((f) => f.id));
    else setSelectedImportFileIds([]);
  };

  const handleDeleteImportFile = async (id: string) => {
    if (!selectedId) return;
    if (!window.confirm('确定删除该上传文件记录吗？')) return;
    setDeletingImportFiles(true);
    setError('');
    try {
      await deleteQuizImportFileApi(id);
      await loadImportFiles(selectedId);
      flash('已删除上传文件');
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除上传文件失败');
    } finally {
      setDeletingImportFiles(false);
    }
  };

  const handleBatchDeleteImportFiles = async () => {
    if (!selectedId || selectedImportFileIds.length === 0) return;
    if (!window.confirm(`确定批量删除 ${selectedImportFileIds.length} 个上传文件记录吗？`)) return;
    setDeletingImportFiles(true);
    setError('');
    try {
      await batchDeleteQuizImportFilesApi(selectedImportFileIds);
      await loadImportFiles(selectedId);
      flash('已批量删除上传文件');
    } catch (err) {
      setError(err instanceof Error ? err.message : '批量删除上传文件失败');
    } finally {
      setDeletingImportFiles(false);
    }
  };

  const typeLabel = typeTab === 'weekly' ? '每周测试' : '知识答题';

  const handleGeneratePreview = useCallback(() => {
    if (!selectedBank) return;
    const basePath =
      typeTab === 'weekly' ? '/quiz-preview/weekly' : '/quiz-preview/knowledge';
    const qs = new URLSearchParams();
    qs.set('bankId', selectedBank.id);
    qs.set('preview', '1');
    const url = qs.toString() ? `${basePath}?${qs.toString()}` : basePath;
    window.open(url, '_blank');
  }, [selectedBank, typeTab]);

  const handleSaveWeeklySchedule = async () => {
    if (!selectedBank || selectedBank.type !== 'weekly') return;
    setScheduleSaving(true);
    setError('');
    try {
      const updated = await updateWeeklyScheduleApi(selectedBank.id, weeklySchedule);
      setWeeklyStatus(updated.weeklyReleaseStatus ?? '');
      await loadBanks();
      const rows = await listWeeklyReleaseHistoryApi(selectedBank.id);
      setWeeklyHistory(rows);
      flash('周测发布时间已更新');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存周测时间失败');
    } finally {
      setScheduleSaving(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-medium" style={{ color: '#382C25' }}>
            题库管理
          </h2>
          <p className="text-sm mt-1" style={{ color: '#7A6E68' }}>
            管理知识答题与每周测试的题目；发布后学员端将加载已发布题库。
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'rgba(56, 44, 37, 0.12)' }}>
            <button
              type="button"
              className="px-4 py-2 text-sm transition-colors"
              style={{
                backgroundColor: typeTab === 'weekly' ? '#5EC4B6' : 'white',
                color: typeTab === 'weekly' ? 'white' : '#382C25',
              }}
              onClick={() => setTypeTab('weekly')}
            >
              每周测试
            </button>
            <button
              type="button"
              className="px-4 py-2 text-sm transition-colors"
              style={{
                backgroundColor: typeTab === 'knowledge' ? '#5EC4B6' : 'white',
                color: typeTab === 'knowledge' ? 'white' : '#382C25',
              }}
              onClick={() => setTypeTab('knowledge')}
            >
              知识答题
            </button>
          </div>
        </div>
      </div>

      {(message || error) && (
        <div
          className="mb-4 px-4 py-3 rounded-lg text-sm"
          style={{
            backgroundColor: error ? 'rgba(232, 93, 117, 0.08)' : 'rgba(94, 196, 182, 0.1)',
            color: error ? '#E85D75' : '#382C25',
          }}
        >
          {error || message}
        </div>
      )}

      <div>
          {!selectedBank ? (
            <div
              className="rounded-lg border p-10 text-center text-sm"
              style={{ borderColor: 'rgba(56, 44, 37, 0.08)', color: '#7A6E68' }}
            >
              暂无{typeLabel}题库，请联系管理员初始化数据
            </div>
          ) : (
            <>
              <div
                className="rounded-lg border p-4 mb-6"
                style={{ borderColor: 'rgba(56, 44, 37, 0.08)' }}
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm" style={{ color: '#7A6E68' }}>当前{typeLabel}卷</span>
                  <span className="px-3 py-2 rounded-lg border text-sm min-w-[240px]" style={{ borderColor: 'rgba(56, 44, 37, 0.12)', color: '#382C25' }}>
                    {selectedBank.title}（{selectedBank.status === 'published' ? '已发布' : '草稿'}）
                  </span>
                  <span className="text-xs" style={{ color: '#7A6E68' }}>
                    共 {selectedBank.questionCount ?? 0} 题
                  </span>
                </div>
              </div>

              <div className={typeTab === 'weekly' ? 'mb-6' : 'mb-6'}>
              <div
                className="rounded-lg border p-5"
                style={{ borderColor: 'rgba(56, 44, 37, 0.08)' }}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium flex items-center gap-2" style={{ color: '#382C25' }}>
                    {typeTab === 'weekly' ? (
                      <BookOpenCheck className="w-4 h-4" style={{ color: '#5EC4B6' }} />
                    ) : (
                      <HelpCircle className="w-4 h-4" style={{ color: '#5EC4B6' }} />
                    )}
                    {typeTab === 'weekly' && weeklyMainView === 'publish' ? '周测发布管理' : '卷设置'}
                  </h3>
                  {typeTab === 'weekly' && (
                    <div
                      className="flex rounded-xl border overflow-hidden"
                      style={{ borderColor: 'rgba(56, 44, 37, 0.12)' }}
                    >
                      <button
                        type="button"
                        className="px-4 py-1.5 text-xs font-medium transition-colors"
                        style={{
                          backgroundColor:
                            weeklyMainView === 'exam' ? '#5EC4B6' : 'white',
                          color: weeklyMainView === 'exam' ? 'white' : '#382C25',
                        }}
                        onClick={() => setWeeklyMainView('exam')}
                      >
                        试卷设置
                      </button>
                      <button
                        type="button"
                        className="px-4 py-1.5 text-xs font-medium transition-colors"
                        style={{
                          backgroundColor:
                            weeklyMainView === 'publish' ? '#5EC4B6' : 'white',
                          color: weeklyMainView === 'publish' ? 'white' : '#382C25',
                        }}
                        onClick={() => setWeeklyMainView('publish')}
                      >
                        发布管理
                      </button>
                    </div>
                  )}
                </div>

                {!(typeTab === 'weekly' && weeklyMainView === 'publish') && (
                <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="block md:col-span-2">
                    <span className="text-xs mb-1 block" style={{ color: '#7A6E68' }}>
                      标题
                    </span>
                    <input
                      className="w-full px-3 py-2 rounded-lg border text-sm"
                      style={{ borderColor: 'rgba(56, 44, 37, 0.12)' }}
                      value={bankForm.title}
                      onChange={(e) => setBankForm((f) => ({ ...f, title: e.target.value }))}
                    />
                  </label>
                  <label className="block md:col-span-2">
                    <span className="text-xs mb-1 block" style={{ color: '#7A6E68' }}>
                      说明
                    </span>
                    <textarea
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg border text-sm resize-y"
                      style={{ borderColor: 'rgba(56, 44, 37, 0.12)' }}
                      value={bankForm.description}
                      onChange={(e) => setBankForm((f) => ({ ...f, description: e.target.value }))}
                    />
                  </label>
                  {typeTab !== 'weekly' && (
                    <label className="block">
                      <span className="text-xs mb-1 block" style={{ color: '#7A6E68' }}>
                        及格线（%）
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        className="w-full px-3 py-2 rounded-lg border text-sm"
                        style={{ borderColor: 'rgba(56, 44, 37, 0.12)' }}
                        value={bankForm.passPercent}
                        onChange={(e) =>
                          setBankForm((f) => ({ ...f, passPercent: Number(e.target.value) }))
                        }
                      />
                    </label>
                  )}
                  <label className="block">
                    <span className="text-xs mb-1 block" style={{ color: '#7A6E68' }}>
                      {typeTab === 'weekly' ? '出题数量' : '抽题数量（固定 100）'}
                    </span>
                    <input
                      type="number"
                      min={1}
                      className="w-full px-3 py-2 rounded-lg border text-sm"
                      style={{ borderColor: 'rgba(56, 44, 37, 0.12)' }}
                      value={bankForm.questionLimit}
                      disabled={typeTab === 'knowledge'}
                      onChange={(e) =>
                        setBankForm((f) => ({ ...f, questionLimit: Number(e.target.value) }))
                      }
                    />
                    <p className="text-xs mt-1" style={{ color: '#7A6E68' }}>
                      {typeTab === 'weekly'
                        ? '周测每次从题库随机抽取该数量题目。'
                        : '培训测试固定抽取 100 题。'}
                    </p>
                  </label>
                  {typeTab === 'knowledge' && (
                    <label className="block">
                      <span className="text-xs mb-1 block" style={{ color: '#7A6E68' }}>
                        时限（分钟，0=不限）
                      </span>
                      <input
                        type="number"
                        min={0}
                        className="w-full px-3 py-2 rounded-lg border text-sm"
                        style={{ borderColor: 'rgba(56, 44, 37, 0.12)' }}
                        value={bankForm.timeLimitMinutes}
                        onChange={(e) =>
                          setBankForm((f) => ({
                            ...f,
                            timeLimitMinutes: Number(e.target.value),
                          }))
                        }
                      />
                    </label>
                  )}
                  <label className="block">
                    <span className="text-xs mb-1 block" style={{ color: '#7A6E68' }}>
                      状态
                    </span>
                    <select
                      className="w-full px-3 py-2 rounded-lg border text-sm"
                      style={{ borderColor: 'rgba(56, 44, 37, 0.12)' }}
                      value={bankForm.status}
                      onChange={(e) =>
                        setBankForm((f) => ({
                          ...f,
                          status: e.target.value as 'draft' | 'published',
                        }))
                      }
                    >
                      <option value="draft">草稿</option>
                      <option value="published">已发布</option>
                    </select>
                  </label>
                </div>
                <div className="flex flex-wrap gap-2 mt-4">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSaveBank}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm"
                    style={{ backgroundColor: '#5EC4B6', color: 'white' }}
                  >
                    <Save className="w-4 h-4" />
                    保存设置
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleDeleteBank}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm border"
                    style={{ borderColor: 'rgba(232, 93, 117, 0.3)', color: '#E85D75' }}
                  >
                    <Trash2 className="w-4 h-4" />
                    删除卷
                  </button>
                </div>
                </>
                )}

              {typeTab === 'weekly' && weeklyMainView === 'publish' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'rgba(56, 44, 37, 0.12)' }}>
                      <button
                        type="button"
                        className="px-3 py-1.5 text-xs"
                        style={{
                          backgroundColor: weeklyPanel === 'schedule' ? '#5EC4B6' : 'white',
                          color: weeklyPanel === 'schedule' ? 'white' : '#382C25',
                        }}
                        onClick={() => setWeeklyPanel('schedule')}
                      >
                        发布设置
                      </button>
                      <button
                        type="button"
                        className="px-3 py-1.5 text-xs"
                        style={{
                          backgroundColor: weeklyPanel === 'history' ? '#5EC4B6' : 'white',
                          color: weeklyPanel === 'history' ? 'white' : '#382C25',
                        }}
                        onClick={() => setWeeklyPanel('history')}
                      >
                        历史记录
                      </button>
                    </div>
                  </div>

                  {weeklyPanel === 'schedule' ? (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className="block">
                          <span className="text-xs mb-1 block" style={{ color: '#7A6E68' }}>发布星期</span>
                          <select
                            className="w-full px-3 py-2 rounded-lg border text-sm"
                            style={{ borderColor: 'rgba(56, 44, 37, 0.12)' }}
                            value={weeklySchedule.publishWeekday}
                            onChange={(e) => setWeeklySchedule((s) => ({ ...s, publishWeekday: Number(e.target.value) }))}
                          >
                            {[1,2,3,4,5,6,7].map((d)=><option key={d} value={d}>星期{['一','二','三','四','五','六','日'][d-1]}</option>)}
                          </select>
                        </label>
                        <label className="block">
                          <span className="text-xs mb-1 block" style={{ color: '#7A6E68' }}>发布时间</span>
                          <input
                            type="time"
                            className="w-full px-3 py-2 rounded-lg border text-sm"
                            style={{ borderColor: 'rgba(56, 44, 37, 0.12)' }}
                            value={weeklySchedule.publishTime}
                            onChange={(e) => setWeeklySchedule((s) => ({ ...s, publishTime: e.target.value }))}
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs mb-1 block" style={{ color: '#7A6E68' }}>结束星期</span>
                          <select
                            className="w-full px-3 py-2 rounded-lg border text-sm"
                            style={{ borderColor: 'rgba(56, 44, 37, 0.12)' }}
                            value={weeklySchedule.endWeekday}
                            onChange={(e) => setWeeklySchedule((s) => ({ ...s, endWeekday: Number(e.target.value) }))}
                          >
                            {[1,2,3,4,5,6,7].map((d)=><option key={d} value={d}>星期{['一','二','三','四','五','六','日'][d-1]}</option>)}
                          </select>
                        </label>
                        <label className="block">
                          <span className="text-xs mb-1 block" style={{ color: '#7A6E68' }}>结束时间</span>
                          <input
                            type="time"
                            className="w-full px-3 py-2 rounded-lg border text-sm"
                            style={{ borderColor: 'rgba(56, 44, 37, 0.12)' }}
                            value={weeklySchedule.endTime}
                            onChange={(e) => setWeeklySchedule((s) => ({ ...s, endTime: e.target.value }))}
                          />
                        </label>
                      </div>
                      <div className="mt-3 text-xs" style={{ color: '#7A6E68' }}>
                        当前状态：{weeklyStatus === 'active' ? '进行中' : weeklyStatus === 'upcoming' ? '未开始' : weeklyStatus === 'ended' ? '已结束' : '—'}
                      </div>
                      <button
                        type="button"
                        disabled={scheduleSaving}
                        onClick={handleSaveWeeklySchedule}
                        className="mt-3 px-4 py-2 rounded-lg text-sm text-white"
                        style={{ backgroundColor: '#5EC4B6' }}
                      >
                        {scheduleSaving ? '保存中…' : '保存发布计划'}
                      </button>
                    </>
                  ) : (
                    <div className="rounded-lg border divide-y" style={{ borderColor: 'rgba(56, 44, 37, 0.08)' }}>
                      {weeklyHistory.length === 0 && (
                        <p className="p-3 text-xs" style={{ color: '#7A6E68' }}>暂无记录</p>
                      )}
                      {weeklyHistory.map((h) => (
                        <div key={h.weekStartDate} className="p-3 flex items-center justify-between text-xs">
                          <span style={{ color: '#382C25' }}>{h.weekStartDate} 周</span>
                          <span style={{ color: '#7A6E68' }}>
                            发布 {new Date(h.publishedAt).toLocaleString()} · 截止 {new Date(h.endedAt).toLocaleString()}
                          </span>
                          <span style={{ color: h.status === 'active' ? '#5EC4B6' : '#7A6E68' }}>
                            {h.status === 'active' ? '进行中' : h.status === 'upcoming' ? '未开始' : '已结束'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              </div>
              </div>

              {!(typeTab === 'weekly' && weeklyMainView === 'publish') && (
              <div
                className="rounded-lg border p-5 mb-6"
                style={{ borderColor: 'rgba(56, 44, 37, 0.08)' }}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h3 className="text-sm font-medium flex items-center gap-2" style={{ color: '#382C25' }}>
                      <Eye className="w-4 h-4" style={{ color: '#5EC4B6' }} />
                      预览答题卷（学员端）
                    </h3>
                    <p className="text-xs mt-1" style={{ color: '#7A6E68' }}>
                      点击后会打开独立预览页，界面与学员实际答题页一致。
                    </p>
                    <p className="text-xs mt-1" style={{ color: '#7A6E68' }}>
                      将直接预览当前选中的题库（包含草稿题库）。
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleGeneratePreview}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
                      style={{ backgroundColor: '#5EC4B6', color: 'white' }}
                    >
                      <RefreshCw className="w-4 h-4" />
                      打开预览页面
                    </button>
                  </div>
                </div>
                <div className="rounded-lg border bg-white p-4 text-sm" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
                  <p style={{ color: '#7A6E68' }}>
                    新窗口会显示学员端真实作答流程（进度、翻题、提交、结果页）。
                  </p>
                </div>
              </div>
              )}

              {!(typeTab === 'weekly' && weeklyMainView === 'publish') && (
              <div
                className="rounded-lg border p-4 mb-4"
                style={{ borderColor: 'rgba(56, 44, 37, 0.08)', backgroundColor: 'rgba(94, 196, 182, 0.04)' }}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setShowImportGuide((v) => !v)}
                    className="flex items-center gap-1 text-sm font-medium"
                    style={{ color: '#382C25' }}
                  >
                    <HelpCircle className="w-4 h-4" style={{ color: '#5EC4B6' }} />
                    导入说明（推荐先看）
                  </button>
                  <button
                    type="button"
                    onClick={() => void downloadQuizImportTemplateApi().catch((e) => setError(e instanceof Error ? e.message : '下载失败'))}
                    className="px-3 py-1.5 rounded-lg text-xs border"
                    style={{ borderColor: 'rgba(94, 196, 182, 0.5)', color: '#382C25' }}
                  >
                    下载 Excel 标准模板
                  </button>
                </div>
                {showImportGuide && (
                  <div className="mt-3 text-xs space-y-2" style={{ color: '#7A6E68' }}>
                    <p>
                      <strong style={{ color: '#382C25' }}>导入方式：</strong>
                      仅使用 AI 自动解析（与「知识库 AI 助手」共用配置管理中的 API Key），支持任意版式的 Word / Excel，与文件名无关。
                    </p>
                    <p>
                      <strong style={{ color: '#382C25' }}>支持格式：</strong>
                      .docx、.xlsx、.xls、.csv；OneDrive 文件请先「始终保留在此设备」再上传。
                    </p>
                    <p>
                      <strong style={{ color: '#382C25' }}>耗时：</strong>
                      题量大时 AI 解析可能需要数分钟，请耐心等待「AI 解析中…」。
                    </p>
                    <p>
                      <strong style={{ color: '#382C25' }}>导入后：</strong>
                      题目会自动同步到已发布的周测卷与培训测试卷；也可手动点击「同步到周测与培训测试」。培训测试每次固定 100 题。
                    </p>
                  </div>
                )}
                {importDiagnostics.length > 0 && (
                  <div className="mt-3 rounded-lg border p-3 bg-white text-xs" style={{ borderColor: 'rgba(232, 93, 117, 0.25)' }}>
                    <p className="font-medium mb-2" style={{ color: '#E85D75' }}>
                      上次导入跳过原因（最多 15 条）
                    </p>
                    <ul className="space-y-1" style={{ color: '#7A6E68' }}>
                      {importDiagnostics.map((item, idx) => (
                        <li key={`${item.row}-${idx}`}>
                          第 {item.row} 行：{item.reason}
                          {item.question ? ` — ${item.question}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              )}

              {!(typeTab === 'weekly' && weeklyMainView === 'publish') && (
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium" style={{ color: '#382C25' }}>
                  题目列表（{questions.length}）
                </h3>
                <div className="flex items-center gap-2 flex-wrap">
                  {!aiImportReady && (
                    <span className="text-xs" style={{ color: '#E85D75' }}>
                      未配置 API → 培训管理 → 配置管理
                    </span>
                  )}
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".docx,.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleImportQuestions(file);
                      e.currentTarget.value = '';
                    }}
                  />
                  <button
                    type="button"
                    disabled={importing || !aiImportReady}
                    onClick={() => importInputRef.current?.click()}
                    className={`${LIST_TOOLBAR_BTN} text-white`}
                    style={{ backgroundColor: '#5EC4B6' }}
                    title={aiImportReady ? '使用 AI 解析上传的文件' : '请先在配置管理配置 AI'}
                  >
                    {importing ? 'AI 解析中…' : 'AI 上传并导入'}
                  </button>
                  <button
                    type="button"
                    disabled={syncing || !selectedId || questions.length === 0}
                    onClick={() => void handleSyncToExams()}
                    className={`${LIST_TOOLBAR_BTN} border bg-white`}
                    style={{ borderColor: 'rgba(94, 196, 182, 0.5)', color: '#382C25' }}
                    title="将当前题库覆盖同步到已发布的周测与培训测试"
                  >
                    {syncing ? '同步中…' : '同步到周测与培训测试'}
                  </button>
                  <button
                    type="button"
                    disabled={saving || selectedQuestionIds.length === 0}
                    onClick={handleBatchDeleteQuestions}
                    className={`${LIST_TOOLBAR_BTN} border bg-white`}
                    style={{ borderColor: 'rgba(232, 93, 117, 0.35)', color: '#E85D75' }}
                  >
                    批量删除
                  </button>
                  <button
                    type="button"
                    onClick={openNewQuestion}
                    className={`${LIST_TOOLBAR_BTN} text-white`}
                    style={{ backgroundColor: '#5EC4B6' }}
                  >
                    <Plus className="w-3.5 h-3.5 shrink-0" />
                    添加题目
                  </button>
                </div>
              </div>
              )}

              {showQuestionForm && !(typeTab === 'weekly' && weeklyMainView === 'publish') && (
                <div
                  className="rounded-lg border p-4 mb-4"
                  style={{ borderColor: 'rgba(94, 196, 182, 0.35)', backgroundColor: 'rgba(94, 196, 182, 0.04)' }}
                >
                  <p className="text-sm font-medium mb-3" style={{ color: '#382C25' }}>
                    {editingQuestionId ? '编辑题目' : '新题目'}
                  </p>
                  <label className="block mb-3">
                    <span className="text-xs mb-1 block" style={{ color: '#7A6E68' }}>
                      题目
                    </span>
                    <textarea
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg border text-sm"
                      style={{ borderColor: 'rgba(56, 44, 37, 0.12)' }}
                      value={questionForm.question}
                      onChange={(e) =>
                        setQuestionForm((f) => ({ ...f, question: e.target.value }))
                      }
                    />
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                    <label className="block">
                      <span className="text-xs mb-1 block" style={{ color: '#7A6E68' }}>
                        题型
                      </span>
                      <select
                        className="w-full px-3 py-2 rounded-lg border text-sm"
                        style={{ borderColor: 'rgba(56, 44, 37, 0.12)' }}
                        value={questionForm.questionType ?? 'single'}
                        onChange={(e) =>
                          setQuestionForm((f) => ({
                            ...f,
                            questionType: e.target.value as 'single' | 'multiple' | 'boolean' | 'text',
                          }))
                        }
                      >
                        <option value="single">单选题</option>
                        <option value="multiple">多选题</option>
                        <option value="boolean">判断题</option>
                        <option value="text">问答题</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs mb-1 block" style={{ color: '#7A6E68' }}>
                        分值
                      </span>
                      <input
                        type="number"
                        min={1}
                        className="w-full px-3 py-2 rounded-lg border text-sm"
                        style={{ borderColor: 'rgba(56, 44, 37, 0.12)' }}
                        value={questionForm.score ?? 1}
                        onChange={(e) =>
                          setQuestionForm((f) => ({ ...f, score: Math.max(1, Number(e.target.value) || 1) }))
                        }
                      />
                    </label>
                  </div>
                  <div className="space-y-2 mb-3">
                    {questionForm.questionType !== 'text' ? (
                      questionForm.options.map((opt, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          {questionForm.questionType === 'multiple' ? (
                            <input
                              type="checkbox"
                              checked={(questionForm.correctIndexes ?? []).includes(idx)}
                              onChange={(e) =>
                                setQuestionForm((f) => {
                                  const set = new Set(f.correctIndexes ?? []);
                                  if (e.target.checked) set.add(idx);
                                  else set.delete(idx);
                                  return { ...f, correctIndexes: [...set].sort((a, b) => a - b) };
                                })
                              }
                            />
                          ) : (
                            <input
                              type="radio"
                              name="correct"
                              checked={questionForm.correctIndex === idx}
                              onChange={() =>
                                setQuestionForm((f) => ({ ...f, correctIndex: idx }))
                              }
                            />
                          )}
                          <input
                            className="flex-1 px-3 py-2 rounded-lg border text-sm"
                            style={{ borderColor: 'rgba(56, 44, 37, 0.12)' }}
                            placeholder={
                              questionForm.questionType === 'boolean'
                                ? idx === 0
                                  ? '正确'
                                  : idx === 1
                                    ? '错误'
                                    : `选项 ${String.fromCharCode(65 + idx)}`
                                : `选项 ${String.fromCharCode(65 + idx)}`
                            }
                            value={opt}
                            onChange={(e) => {
                              const options = [...questionForm.options];
                              options[idx] = e.target.value;
                              setQuestionForm((f) => ({ ...f, options }));
                            }}
                          />
                        </div>
                      ))
                    ) : (
                      <label className="block">
                        <span className="text-xs mb-1 block" style={{ color: '#7A6E68' }}>
                          参考答案（自动判分）
                        </span>
                        <textarea
                          rows={2}
                          className="w-full px-3 py-2 rounded-lg border text-sm"
                          style={{ borderColor: 'rgba(56, 44, 37, 0.12)' }}
                          value={questionForm.answerText ?? ''}
                          onChange={(e) => setQuestionForm((f) => ({ ...f, answerText: e.target.value }))}
                        />
                      </label>
                    )}
                  </div>
                  <label className="block mb-3">
                    <span className="text-xs mb-1 block" style={{ color: '#7A6E68' }}>
                      分类标签
                    </span>
                    <input
                      className="w-full px-3 py-2 rounded-lg border text-sm"
                      style={{ borderColor: 'rgba(56, 44, 37, 0.12)' }}
                      value={questionForm.category ?? ''}
                      onChange={(e) =>
                        setQuestionForm((f) => ({ ...f, category: e.target.value }))
                      }
                    />
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleSaveQuestion}
                      className="px-4 py-2 rounded-lg text-sm"
                      style={{ backgroundColor: '#5EC4B6', color: 'white' }}
                    >
                      保存题目
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowQuestionForm(false)}
                      className="px-4 py-2 rounded-lg text-sm border"
                      style={{ borderColor: 'rgba(56, 44, 37, 0.12)' }}
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}

              {!(typeTab === 'weekly' && weeklyMainView === 'publish') && (
              <div
                className="rounded-lg border divide-y"
                style={{ borderColor: 'rgba(56, 44, 37, 0.08)' }}
              >
                {questions.length === 0 && (
                  <p className="p-4 text-sm" style={{ color: '#7A6E68' }}>
                    暂无题目
                  </p>
                )}
                {questions.length > 0 && (
                  <div className="px-4 py-2 text-xs flex items-center gap-2" style={{ color: '#7A6E68' }}>
                    <input
                      type="checkbox"
                      checked={selectedQuestionIds.length > 0 && selectedQuestionIds.length === questions.length}
                      onChange={(e) => toggleAllQuestions(e.target.checked)}
                    />
                    全选（已选 {selectedQuestionIds.length}）
                  </div>
                )}
                {questions.map((q, index) => (
                  <div
                    key={q.id}
                    className="px-4 py-3 flex gap-3 items-start"
                    style={{ opacity: q.enabled ? 1 : 0.5 }}
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selectedQuestionIds.includes(q.id)}
                      onChange={(e) => toggleQuestionSelect(q.id, e.target.checked)}
                    />
                    <span className="text-xs mt-1 shrink-0" style={{ color: '#7A6E68' }}>
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm" style={{ color: '#382C25' }}>
                        {q.question}
                      </p>
                      <p className="text-xs mt-1" style={{ color: '#7A6E68' }}>
                        题型：{q.questionType === 'multiple' ? '多选' : q.questionType === 'boolean' ? '判断' : q.questionType === 'text' ? '问答' : '单选'}
                        {' · '}
                        分值：{q.score ?? 1}
                        {' · '}
                        正确答案：
                        {q.questionType === 'multiple'
                          ? (q.correctIndexes ?? []).map((i) => q.options[i]).filter(Boolean).join(' / ') || '—'
                          : q.questionType === 'text'
                            ? q.answerText || '—'
                            : q.options[q.correctIndex] ?? '—'}
                        {q.category ? ` · ${q.category}` : ''}
                        {!q.enabled ? ' · 已停用' : ''}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        className="text-xs px-2 py-1 rounded border"
                        style={{ borderColor: 'rgba(56, 44, 37, 0.12)' }}
                        onClick={() => openEditQuestion(q)}
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        className="text-xs px-2 py-1 rounded"
                        style={{ color: '#E85D75' }}
                        onClick={() => handleDeleteQuestion(q.id)}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              )}

              {!(typeTab === 'weekly' && weeklyMainView === 'publish') && (
                <div
                  className="rounded-lg border p-4 mt-6"
                  style={{ borderColor: 'rgba(56, 44, 37, 0.08)' }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium" style={{ color: '#382C25' }}>
                      已上传文件（{importFiles.length}）
                    </h3>
                    <button
                      type="button"
                      disabled={deletingImportFiles || selectedImportFileIds.length === 0}
                      onClick={handleBatchDeleteImportFiles}
                      className="px-3 py-1.5 rounded-lg text-xs border"
                      style={{ borderColor: 'rgba(232, 93, 117, 0.35)', color: '#E85D75' }}
                    >
                      批量删除文件
                    </button>
                  </div>
                  {importFiles.length > 0 && (
                    <div className="text-xs flex items-center gap-2 mb-2" style={{ color: '#7A6E68' }}>
                      <input
                        type="checkbox"
                        checked={
                          selectedImportFileIds.length > 0 &&
                          selectedImportFileIds.length === importFiles.length
                        }
                        onChange={(e) => toggleAllImportFiles(e.target.checked)}
                      />
                      全选（已选 {selectedImportFileIds.length}）
                    </div>
                  )}
                  <div className="rounded-lg border divide-y" style={{ borderColor: 'rgba(56, 44, 37, 0.08)' }}>
                    {importFiles.length === 0 && (
                      <p className="p-3 text-xs" style={{ color: '#7A6E68' }}>
                        暂无上传文件记录
                      </p>
                    )}
                    {importFiles.map((f) => (
                      <div key={f.id} className="p-3 flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={selectedImportFileIds.includes(f.id)}
                            onChange={(e) => toggleImportFileSelect(f.id, e.target.checked)}
                          />
                          <div>
                            <p className="text-sm" style={{ color: '#382C25' }}>
                              {f.originalName}
                            </p>
                            <p className="text-xs mt-1" style={{ color: '#7A6E68' }}>
                              导入 {f.importedCount} 道 · 跳过 {f.skippedCount} 道 ·
                              {f.importedCount === 0 ? ' 未入库（请检查 AI 或文件内容）·' : ''}
                              {` ${new Date(f.createdAt).toLocaleString()}`}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={deletingImportFiles}
                          className="text-xs px-2 py-1 rounded"
                          style={{ color: '#E85D75' }}
                          onClick={() => handleDeleteImportFile(f.id)}
                        >
                          删除
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
      </div>
    </div>
  );
}
