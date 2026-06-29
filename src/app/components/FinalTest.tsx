import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AlertCircle, CheckCircle, XCircle, Clock, ChevronRight, ChevronLeft, Award } from 'lucide-react';
import {
  fetchQuizPreviewApi,
  fetchQuizTakeApi,
  listPublishedKnowledgeBanksApi,
  submitQuizApi,
  submitQuizPreviewApi,
} from '../lib/quizzesApi';
import type { QuizBank, QuizSubmitResult, QuizTakePayload, QuizTakeQuestion } from '../types/quiz';

export default function FinalTest() {
  const [searchParams] = useSearchParams();
  const previewBankId = searchParams.get('bankId') || undefined;
  const previewMode = searchParams.get('preview') === '1';
  const [metaLoading, setMetaLoading] = useState(true);
  const [metaError, setMetaError] = useState('');
  const [bankMeta, setBankMeta] = useState<QuizBank | null>(null);
  const [previewPayload, setPreviewPayload] = useState<QuizTakePayload | null>(null);
  const [testStarted, setTestStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [bankId, setBankId] = useState('');
  const [questions, setQuestions] = useState<QuizTakeQuestion[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [singleAnswers, setSingleAnswers] = useState<(number | null)[]>([]);
  const [multiAnswers, setMultiAnswers] = useState<number[][]>([]);
  const [textAnswers, setTextAnswers] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<QuizSubmitResult | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const handleEndPreview = () => {
    window.close();
    window.location.href = '/admin';
  };

  const questionTotal = questions.length;
  const timeLimitMinutes = bankMeta?.timeLimitMinutes ?? 0;

  const loadMeta = useCallback(async () => {
    setMetaLoading(true);
    setMetaError('');
    try {
      if (previewMode && previewBankId) {
        const payload = await fetchQuizPreviewApi('knowledge', previewBankId);
        setPreviewPayload(payload);
        setBankMeta({
          id: payload.bank.id,
          type: 'knowledge',
          title: payload.bank.title,
          description: payload.bank.description,
          passPercent: payload.bank.passPercent,
          questionLimit: payload.bank.questionCount,
          timeLimitMinutes: payload.bank.timeLimitMinutes,
          status: 'draft',
          sortOrder: 0,
        });
        return;
      }
      const banks = await listPublishedKnowledgeBanksApi();
      if (banks.length === 0) {
        setBankMeta(null);
        setMetaError('暂无已发布的知识答题卷');
        return;
      }
      if (previewBankId) {
        setBankMeta(banks.find((b) => b.id === previewBankId) ?? banks[0]);
      } else {
        setBankMeta(banks[0]);
      }
      setPreviewPayload(null);
    } catch (err) {
      setMetaError(err instanceof Error ? err.message : '加载考试信息失败');
    } finally {
      setMetaLoading(false);
    }
  }, [previewBankId, previewMode]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const doSubmit = useCallback(async () => {
    if (submitting || submitted || !bankId || questions.length === 0) return;
    setSubmitting(true);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    try {
      const answers = questions.map((q, index) => ({
        questionId: q.id,
        selectedIndex: singleAnswers[index] ?? -1,
        selectedIndexes: multiAnswers[index] ?? [],
        textAnswer: textAnswers[index] ?? '',
      }));
      const res =
        previewMode
          ? await submitQuizPreviewApi(bankId, answers)
          : await submitQuizApi(bankId, answers);
      setResult(res);
      setSubmitted(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  }, [bankId, questions, singleAnswers, multiAnswers, textAnswers, submitted, submitting]);

  const handleStartTest = async () => {
    setStarting(true);
    try {
      const payload =
        previewMode && previewBankId
          ? previewPayload ?? (await fetchQuizPreviewApi('knowledge', previewBankId))
          : await fetchQuizTakeApi('knowledge', previewBankId ?? bankMeta?.id);
      setBankId(payload.bank.id);
      setQuestions(payload.questions);
      setSingleAnswers(payload.questions.map(() => null));
      setMultiAnswers(payload.questions.map(() => []));
      setTextAnswers(payload.questions.map(() => ''));
      const seconds = payload.bank.timeLimitMinutes > 0 ? payload.bank.timeLimitMinutes * 60 : 0;
      setTimeRemaining(seconds);
      setCurrentQuestion(0);
      setTestStarted(true);
      if (seconds > 0) {
        timerRef.current = setInterval(() => {
          setTimeRemaining((prev) => {
            if (prev <= 1) {
              if (timerRef.current) clearInterval(timerRef.current);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '无法开始考试');
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    if (testStarted && timeRemaining === 0 && timeLimitMinutes > 0 && !submitted) {
      doSubmit();
    }
  }, [testStarted, timeRemaining, timeLimitMinutes, submitted, doSubmit]);

  const handleSelectSingle = (answerIndex: number) => {
    if (submitted) return;
    const next = [...singleAnswers];
    next[currentQuestion] = answerIndex;
    setSingleAnswers(next);
  };

  const handleToggleMulti = (answerIndex: number) => {
    if (submitted) return;
    setMultiAnswers((prev) => {
      const next = prev.map((x) => [...x]);
      const set = new Set(next[currentQuestion] ?? []);
      if (set.has(answerIndex)) set.delete(answerIndex);
      else set.add(answerIndex);
      next[currentQuestion] = [...set].sort((a, b) => a - b);
      return next;
    });
  };

  const handleTextAnswer = (value: string) => {
    if (submitted) return;
    const next = [...textAnswers];
    next[currentQuestion] = value;
    setTextAnswers(next);
  };

  const handleSubmit = () => {
    const unanswered = questions.filter((q, i) => {
      const t = q.questionType || 'single';
      if (t === 'multiple') return (multiAnswers[i] ?? []).length === 0;
      if (t === 'text') return !String(textAnswers[i] ?? '').trim();
      return singleAnswers[i] === null;
    }).length;
    if (unanswered > 0 && !window.confirm(`还有${unanswered}道题未作答，确定要提交吗？`)) return;
    doSubmit();
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const answeredCount = useMemo(
    () =>
      questions.filter((q, i) => {
        const t = q.questionType || 'single';
        if (t === 'multiple') return (multiAnswers[i] ?? []).length > 0;
        if (t === 'text') return String(textAnswers[i] ?? '').trim().length > 0;
        return singleAnswers[i] !== null;
      }).length,
    [questions, singleAnswers, multiAnswers, textAnswers],
  );

  if (!testStarted) {
    if (metaLoading) return <div className="p-8 max-w-3xl mx-auto text-center text-sm" style={{ color: '#7A6E68' }}>加载考试信息…</div>;
    if (metaError || !bankMeta) {
      return <div className="p-8 max-w-3xl mx-auto text-center"><p className="text-sm mb-4" style={{ color: '#E85D75' }}>{metaError || '暂无考试'}</p><button type="button" onClick={loadMeta} className="px-6 py-2 rounded-lg text-white text-sm" style={{ backgroundColor: '#5EC4B6' }}>重试</button></div>;
    }
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="bg-white p-10 rounded-lg border" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-5" style={{ backgroundColor: 'rgba(94, 196, 182, 0.1)' }}><Award className="w-10 h-10" style={{ color: '#5EC4B6' }} /></div>
            <h2 className="text-xl font-medium mb-2" style={{ color: '#382C25' }}>{bankMeta.title}</h2>
            {bankMeta.description && <p className="text-sm mb-2" style={{ color: '#7A6E68' }}>{bankMeta.description}</p>}
          </div>
          <div className="space-y-4 mb-10">
            <div className="flex items-start p-4 rounded-lg" style={{ backgroundColor: 'rgba(132, 197, 87, 0.05)' }}><Clock className="w-5 h-5 mt-0.5 mr-3 flex-shrink-0" style={{ color: '#5EC4B6' }} /><div><h3 className="text-sm font-medium mb-1" style={{ color: '#382C25' }}>考试时间</h3><p className="text-sm" style={{ color: '#7A6E68' }}>{timeLimitMinutes > 0 ? `${timeLimitMinutes} 分钟` : '不限时'}</p></div></div>
            <div className="flex items-start p-4 rounded-lg" style={{ backgroundColor: '#F5F5F5' }}><CheckCircle className="w-5 h-5 mt-0.5 mr-3 flex-shrink-0" style={{ color: '#5EC4B6' }} /><div><h3 className="text-sm font-medium mb-1" style={{ color: '#382C25' }}>题目数量</h3><p className="text-sm" style={{ color: '#7A6E68' }}>共 {bankMeta.questionLimit || 100} 题（含单选 / 多选 / 判断 / 问答）</p></div></div>
            <div className="flex items-start p-4 rounded-lg" style={{ backgroundColor: '#F5F5F5' }}><CheckCircle className="w-5 h-5 mt-0.5 mr-3 flex-shrink-0" style={{ color: '#5EC4B6' }} /><div><h3 className="text-sm font-medium mb-1" style={{ color: '#382C25' }}>及格标准</h3><p className="text-sm" style={{ color: '#7A6E68' }}>得分达到 60 分及以上为合格</p></div></div>
            <div className="flex items-start p-4 rounded-lg" style={{ backgroundColor: '#F5F5F5' }}><AlertCircle className="w-5 h-5 mt-0.5 mr-3 flex-shrink-0" style={{ color: '#7A6E68' }} /><div><h3 className="text-sm font-medium mb-2" style={{ color: '#382C25' }}>注意事项</h3><ul className="text-sm space-y-1" style={{ color: '#7A6E68' }}><li>• 问答题按参考答案自动判分</li><li>• 可以随时返回修改答案</li><li>• 时间到将自动提交</li></ul></div></div>
          </div>
          <button type="button" onClick={handleStartTest} disabled={starting} className="w-full py-3.5 rounded-lg text-white transition-all disabled:opacity-60" style={{ backgroundColor: '#5EC4B6' }}>{starting ? '准备试卷…' : '开始考试'}</button>
        </div>
      </div>
    );
  }

  if (submitted && result) {
    const passed = result.passed;
    return (
      <div className="p-8 max-w-5xl mx-auto">
        <div className="bg-white p-10 rounded-lg border" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-6" style={{ backgroundColor: passed ? 'rgba(132, 197, 87, 0.1)' : 'rgba(232, 93, 117, 0.1)' }}>
              {passed ? <Award className="w-12 h-12" style={{ color: '#5EC4B6' }} /> : <XCircle className="w-12 h-12" style={{ color: '#E85D75' }} />}
            </div>
            <h2 className="text-3xl font-medium mb-4" style={{ color: '#382C25' }}>{passed ? '恭喜通过考核' : '未达到及格线'}</h2>
            <div className="text-6xl font-medium mb-6" style={{ color: passed ? '#5EC4B6' : '#E85D75' }}>{result.score}/{result.total}</div>
          </div>
          {previewMode && (
            <div className="text-center">
              <button
                type="button"
                onClick={handleEndPreview}
                className="px-8 py-2.5 rounded-lg text-sm border"
                style={{ borderColor: 'rgba(56, 44, 37, 0.12)', color: '#382C25' }}
              >
                结束预览
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (questionTotal === 0) return <div className="p-8 max-w-3xl mx-auto text-center text-sm" style={{ color: '#7A6E68' }}>试卷加载失败，请返回重试</div>;

  const question = questions[currentQuestion];
  const qType = question.questionType || 'single';

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="bg-white p-4 rounded-lg border mb-6 flex items-center justify-between" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
        <div className="flex items-center">{timeLimitMinutes > 0 && <><Clock className="w-5 h-5 mr-2" style={{ color: '#5EC4B6' }} /><span className="text-sm font-medium" style={{ color: '#382C25' }}>剩余时间: <span style={{ color: '#5EC4B6' }}>{formatTime(timeRemaining)}</span></span></>}</div>
        <div className="flex items-center gap-4"><span className="text-sm" style={{ color: '#7A6E68' }}>已完成: {answeredCount}/{questionTotal}</span><button type="button" onClick={handleSubmit} disabled={submitting} className="px-5 py-2 rounded-lg text-white text-sm transition-all disabled:opacity-60" style={{ backgroundColor: '#5EC4B6' }}>{submitting ? '提交中…' : '提交试卷'}</button></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1"><div className="bg-white p-4 rounded-lg border sticky top-4" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}><h3 className="text-sm font-medium mb-4" style={{ color: '#382C25' }}>题目导航</h3><div className="grid grid-cols-5 gap-2 max-h-96 overflow-y-auto">{questions.map((_, index) => <button key={index} onClick={() => setCurrentQuestion(index)} className="w-9 h-9 rounded text-xs transition-all" style={{ backgroundColor: index === currentQuestion ? '#5EC4B6' : '#fff', color: index === currentQuestion ? 'white' : '#7A6E68', border: '1px solid rgba(56, 44, 37, 0.06)' }}>{index + 1}</button>)}</div></div></div>
        <div className="lg:col-span-3"><div className="bg-white p-8 rounded-lg border mb-6" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}><div className="mb-6"><div className="flex items-center justify-between mb-4"><span className="text-xs" style={{ color: '#7A6E68' }}>题目 {currentQuestion + 1}/{questionTotal}</span><span className="text-xs px-3 py-1 rounded" style={{ backgroundColor: '#F5F5F5', color: '#7A6E68' }}>{qType === 'single' ? '单选题' : qType === 'multiple' ? '多选题' : qType === 'boolean' ? '判断题' : qType === 'text' ? '问答题' : '综合'}</span></div><h2 className="text-lg font-medium" style={{ color: '#382C25' }}>{question.question}</h2></div>{qType === 'text' ? <textarea value={textAnswers[currentQuestion] ?? ''} onChange={(e) => handleTextAnswer(e.target.value)} rows={4} className="w-full p-4 rounded-lg border text-sm" style={{ borderColor: 'rgba(56, 44, 37, 0.12)' }} placeholder="请输入答案" /> : <div className="space-y-3">{question.options.map((option, index) => {const active = qType === 'multiple' ? (multiAnswers[currentQuestion] ?? []).includes(index) : singleAnswers[currentQuestion] === index; return <button key={index} type="button" onClick={() => qType === 'multiple' ? handleToggleMulti(index) : handleSelectSingle(index)} className="w-full p-4 text-left rounded-lg border transition-all" style={{ borderColor: active ? '#5EC4B6' : 'rgba(56, 44, 37, 0.06)', backgroundColor: active ? 'rgba(132, 197, 87, 0.05)' : 'white' }}><span className="text-sm" style={{ color: '#382C25' }}>{option}</span></button>;})}</div>}</div><div className="flex justify-between"><button onClick={() => setCurrentQuestion((i) => Math.max(0, i - 1))} disabled={currentQuestion === 0} className="flex items-center px-5 py-2.5 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed" style={{ backgroundColor: 'white', border: '1px solid rgba(56, 44, 37, 0.06)', color: '#7A6E68' }}><ChevronLeft className="w-4 h-4 mr-1" /><span className="text-sm">上一题</span></button><button onClick={() => setCurrentQuestion((i) => Math.min(questionTotal - 1, i + 1))} disabled={currentQuestion === questionTotal - 1} className="flex items-center px-5 py-2.5 rounded-lg text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed" style={{ backgroundColor: '#5EC4B6' }}><span className="text-sm">下一题</span><ChevronRight className="w-4 h-4 ml-1" /></button></div></div>
      </div>
    </div>
  );
}
