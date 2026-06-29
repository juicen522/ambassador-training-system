import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { CheckCircle, XCircle, ChevronRight, ChevronLeft, Award } from 'lucide-react';
import {
  fetchQuizPreviewApi,
  fetchQuizTakeApi,
  submitQuizApi,
  submitQuizPreviewApi,
} from '../lib/quizzesApi';
import type { QuizSubmitResult, QuizTakeQuestion } from '../types/quiz';

export default function WeeklyTest() {
  const [searchParams] = useSearchParams();
  const previewBankId = searchParams.get('bankId') || undefined;
  const previewMode = searchParams.get('preview') === '1';
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [bankId, setBankId] = useState('');
  const [bankTitle, setBankTitle] = useState('');
  const [passPercent, setPassPercent] = useState(60);
  const [questions, setQuestions] = useState<QuizTakeQuestion[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [singleAnswers, setSingleAnswers] = useState<(number | null)[]>([]);
  const [multiAnswers, setMultiAnswers] = useState<number[][]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<QuizSubmitResult | null>(null);
  const handleEndPreview = () => {
    window.close();
    window.location.href = '/admin';
  };

  const loadTest = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    setSubmitted(false);
    setResult(null);
    setCurrentQuestion(0);
    try {
      const payload =
        previewMode && previewBankId
          ? await fetchQuizPreviewApi('weekly', previewBankId)
          : await fetchQuizTakeApi('weekly', previewBankId);
      setBankId(payload.bank.id);
      setBankTitle(payload.bank.title);
      setPassPercent(payload.bank.passPercent);
      setQuestions(payload.questions);
      setSingleAnswers(payload.questions.map(() => null));
      setMultiAnswers(payload.questions.map(() => []));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '加载测试失败');
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }, [previewBankId, previewMode]);

  useEffect(() => {
    loadTest();
  }, [loadTest]);

  const isQuestionAnswered = useCallback(
    (q: QuizTakeQuestion, index: number) => {
      const t = q.questionType || 'single';
      if (t === 'multiple') return (multiAnswers[index] ?? []).length > 0;
      return singleAnswers[index] !== null;
    },
    [singleAnswers, multiAnswers],
  );

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

  const handleNext = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1);
    }
  };

  const handleSubmit = async () => {
    const unanswered = questions.filter((q, i) => !isQuestionAnswered(q, i)).length;
    if (unanswered > 0) {
      if (!window.confirm(`还有 ${unanswered} 道题未作答，确定要提交吗？`)) return;
    }
    setSubmitting(true);
    try {
      const answers = questions.map((q, index) => ({
        questionId: q.id,
        selectedIndex: singleAnswers[index] ?? -1,
        selectedIndexes: multiAnswers[index] ?? [],
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
  };

  const handleRetake = () => {
    loadTest();
  };

  if (loading) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center text-sm" style={{ color: '#7A6E68' }}>
        加载测试中…
      </div>
    );
  }

  if (loadError || questions.length === 0) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center">
        <p className="text-sm mb-4" style={{ color: '#E85D75' }}>
          {loadError || '暂无已发布的每周测试'}
        </p>
        <button
          type="button"
          onClick={loadTest}
          className="px-6 py-2 rounded-lg text-white text-sm"
          style={{ backgroundColor: '#5EC4B6' }}
        >
          重试
        </button>
      </div>
    );
  }

  if (submitted && result) {
    const passed = result.passed;
    const detailMap = new Map(result.details.map((d) => [d.questionId, d]));

    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="bg-white p-10 rounded-lg border text-center" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-6"
            style={{ backgroundColor: passed ? 'rgba(94, 196, 182, 0.1)' : 'rgba(232, 93, 117, 0.1)' }}
          >
            {passed ? (
              <Award className="w-10 h-10" style={{ color: '#5EC4B6' }} />
            ) : (
              <XCircle className="w-10 h-10" style={{ color: '#E85D75' }} />
            )}
          </div>

          <h2 className="text-2xl font-medium mb-2" style={{ color: '#382C25' }}>
            {passed ? '测试通过' : '继续努力'}
          </h2>

          <div className="text-5xl font-medium mb-6" style={{ color: passed ? '#5EC4B6' : '#E85D75' }}>
            {result.score}/{result.total}
          </div>

          <p className="text-sm mb-10" style={{ color: '#7A6E68' }}>
            正确率: {result.percent.toFixed(0)}%
          </p>

          <div className="space-y-3 mb-10 text-left">
            {questions.map((q, index) => {
              const detail = detailMap.get(q.id);
              const isCorrect = detail?.correct ?? false;
              const qType = q.questionType || 'single';
              const yourAnswer =
                qType === 'multiple'
                  ? (multiAnswers[index] ?? [])
                      .map((i) => q.options[i])
                      .filter(Boolean)
                      .join('、') || '—'
                  : singleAnswers[index] !== null
                    ? q.options[singleAnswers[index] as number]
                    : '—';
              const correctAnswer =
                qType === 'multiple'
                  ? (detail?.correctIndexes ?? [])
                      .map((i) => q.options[i])
                      .filter(Boolean)
                      .join('、') || '—'
                  : detail?.correctIndex !== undefined
                    ? q.options[detail.correctIndex]
                    : '—';
              return (
                <div
                  key={q.id}
                  className="border rounded-lg p-4"
                  style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-sm font-medium" style={{ color: '#382C25' }}>
                      题目 {index + 1}: {q.question}
                    </p>
                    {isCorrect ? (
                      <CheckCircle className="w-4 h-4 flex-shrink-0 ml-2" style={{ color: '#5EC4B6' }} />
                    ) : (
                      <XCircle className="w-4 h-4 flex-shrink-0 ml-2" style={{ color: '#E85D75' }} />
                    )}
                  </div>
                  <p className="text-xs mb-1" style={{ color: '#7A6E68' }}>
                    你的答案: {yourAnswer}
                  </p>
                  {!isCorrect && correctAnswer !== '—' && (
                    <p className="text-xs" style={{ color: '#5EC4B6' }}>
                      正确答案: {correctAnswer}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleRetake}
              className="px-8 py-2.5 rounded-lg text-white transition-all"
              style={{ backgroundColor: '#5EC4B6' }}
            >
              重新测试
            </button>
            {previewMode && (
              <button
                type="button"
                onClick={handleEndPreview}
                className="px-8 py-2.5 rounded-lg text-sm border"
                style={{ borderColor: 'rgba(56, 44, 37, 0.12)', color: '#382C25' }}
              >
                结束预览
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const question = questions[currentQuestion];
  const qType = question.questionType || 'single';
  const isMultiple = qType === 'multiple';

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {bankTitle && (
        <p className="text-sm mb-4" style={{ color: '#7A6E68' }}>
          {bankTitle} · 及格线 {passPercent}%
        </p>
      )}

      <div className="mb-8">
        <div className="flex justify-between mb-2 text-xs" style={{ color: '#7A6E68' }}>
          <span>进度</span>
          <span>
            {currentQuestion + 1}/{questions.length}
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full" style={{ backgroundColor: '#F5F5F5' }}>
          <div
            className="h-1.5 rounded-full transition-all"
            style={{
              width: `${((currentQuestion + 1) / questions.length) * 100}%`,
              backgroundColor: '#5EC4B6',
            }}
          />
        </div>
      </div>

      <div className="bg-white p-8 rounded-lg border mb-8" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs" style={{ color: '#7A6E68' }}>
              题目 {currentQuestion + 1}
            </span>
            <span
              className="text-xs px-3 py-1 rounded"
              style={{ backgroundColor: '#F5F5F5', color: '#7A6E68' }}
            >
              {isMultiple ? '多选题' : qType === 'boolean' ? '判断题' : '单选题'}
            </span>
          </div>
          <h2 className="text-xl font-medium" style={{ color: '#382C25' }}>
            {question.question}
          </h2>
          {isMultiple && (
            <p className="text-xs mt-2" style={{ color: '#7A6E68' }}>
              可多选，点击选项切换选中状态
            </p>
          )}
        </div>

        <div className="space-y-3">
          {question.options.map((option, index) => {
            const active = isMultiple
              ? (multiAnswers[currentQuestion] ?? []).includes(index)
              : singleAnswers[currentQuestion] === index;
            return (
              <button
                key={index}
                type="button"
                onClick={() =>
                  isMultiple ? handleToggleMulti(index) : handleSelectSingle(index)
                }
                className="w-full p-4 text-left rounded-lg border transition-all"
                style={{
                  borderColor: active ? '#5EC4B6' : 'rgba(56, 44, 37, 0.06)',
                  backgroundColor: active ? 'rgba(94, 196, 182, 0.05)' : 'white',
                }}
              >
                <div className="flex items-center">
                  <div
                    className={`w-5 h-5 border-2 mr-3 flex items-center justify-center flex-shrink-0 ${
                      isMultiple ? 'rounded' : 'rounded-full'
                    }`}
                    style={{
                      borderColor: active ? '#5EC4B6' : 'rgba(56, 44, 37, 0.15)',
                      backgroundColor: active ? '#5EC4B6' : 'transparent',
                    }}
                  >
                    {active &&
                      (isMultiple ? (
                        <svg
                          className="w-3 h-3 text-white"
                          viewBox="0 0 12 12"
                          fill="none"
                          aria-hidden
                        >
                          <path
                            d="M2 6l3 3 5-5"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : (
                        <div className="w-2 h-2 bg-white rounded-full" />
                      ))}
                  </div>
                  <span className="text-sm" style={{ color: '#382C25' }}>
                    {option}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex justify-between mb-6">
        <button
          type="button"
          onClick={handlePrevious}
          disabled={currentQuestion === 0}
          className="flex items-center px-5 py-2.5 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            backgroundColor: 'white',
            border: '1px solid rgba(56, 44, 37, 0.06)',
            color: '#7A6E68',
          }}
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          <span className="text-sm">上一题</span>
        </button>

        {currentQuestion === questions.length - 1 ? (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center px-5 py-2.5 rounded-lg text-white transition-all disabled:opacity-60"
            style={{ backgroundColor: '#5EC4B6' }}
          >
            <span className="text-sm">{submitting ? '提交中…' : '提交答案'}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleNext}
            className="flex items-center px-5 py-2.5 rounded-lg text-white transition-all"
            style={{ backgroundColor: '#5EC4B6' }}
          >
            <span className="text-sm">下一题</span>
            <ChevronRight className="w-4 h-4 ml-1" />
          </button>
        )}
      </div>

      <div className="flex justify-center gap-2 flex-wrap">
        {questions.map((q, index) => {
          const answered = isQuestionAnswered(q, index);
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => setCurrentQuestion(index)}
              className="w-9 h-9 rounded-lg transition-all text-sm"
              style={{
                backgroundColor:
                  index === currentQuestion
                    ? '#5EC4B6'
                    : answered
                      ? 'rgba(94, 196, 182, 0.1)'
                      : 'white',
                color:
                  index === currentQuestion ? 'white' : answered ? '#5EC4B6' : '#7A6E68',
                border: `1px solid ${index === currentQuestion || answered ? '#5EC4B6' : 'rgba(56, 44, 37, 0.06)'}`,
              }}
            >
              {index + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
