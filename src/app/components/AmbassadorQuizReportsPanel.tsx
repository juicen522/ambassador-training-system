import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw, Search } from 'lucide-react';
import type { QuizAttemptReport, QuizBankType } from '../types/quiz';
import {
  downloadQuizAttemptReportsApi,
  listQuizAttemptReportsApi,
} from '../lib/quizzesApi';

const labelStyle = { color: '#382C25' };
const hintStyle = { color: '#7A6E68' };

interface AmbassadorQuizReportsPanelProps {
  type: QuizBankType;
}

function formatDateTime(value: string) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AmbassadorQuizReportsPanel({ type }: AmbassadorQuizReportsPanelProps) {
  const [reports, setReports] = useState<QuizAttemptReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const title = type === 'weekly' ? '周测报告' : '培训测试报告';
  const description =
    type === 'weekly'
      ? '查看大使每次周测的得分、正确率与提交时间，支持按姓名筛选并导出 Excel。'
      : '查看大使培训测试（知识答题）成绩与是否通过，支持筛选并导出 Excel。';

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const from = fromDate ? `${fromDate} 00:00:00` : undefined;
      const to = toDate ? `${toDate} 23:59:59` : undefined;
      const rows = await listQuizAttemptReportsApi({
        type,
        search: search.trim() || undefined,
        from,
        to,
      });
      setReports(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载报告失败');
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [type, search, fromDate, toDate]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const stats = useMemo(() => {
    const total = reports.length;
    const passed =
      type === 'knowledge' ? reports.filter((r) => r.passed).length : total;
    const avgPercent =
      total > 0
        ? Math.round(reports.reduce((sum, r) => sum + r.percent, 0) / total)
        : 0;
    const users = new Set(reports.map((r) => r.userId)).size;
    return { total, passed, avgPercent, users };
  }, [reports, type]);

  const handleDownload = async () => {
    setDownloading(true);
    setError('');
    try {
      const from = fromDate ? `${fromDate} 00:00:00` : undefined;
      const to = toDate ? `${toDate} 23:59:59` : undefined;
      await downloadQuizAttemptReportsApi({
        type,
        search: search.trim() || undefined,
        from,
        to,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h3 className="text-base font-medium mb-1" style={labelStyle}>
          {title}
        </h3>
        <p className="text-sm" style={hintStyle}>
          {description}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div
          className="bg-white p-5 rounded-lg border"
          style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
        >
          <p className="text-xs mb-1" style={hintStyle}>
            记录条数
          </p>
          <p className="text-2xl font-medium" style={labelStyle}>
            {stats.total}
          </p>
        </div>
        <div
          className="bg-white p-5 rounded-lg border"
          style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
        >
          <p className="text-xs mb-1" style={hintStyle}>
            参考人数
          </p>
          <p className="text-2xl font-medium" style={labelStyle}>
            {stats.users}
          </p>
        </div>
        <div
          className="bg-white p-5 rounded-lg border"
          style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
        >
          <p className="text-xs mb-1" style={hintStyle}>
            平均正确率
          </p>
          <p className="text-2xl font-medium" style={labelStyle}>
            {stats.avgPercent}%
          </p>
        </div>
        <div
          className="bg-white p-5 rounded-lg border"
          style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
        >
          <p className="text-xs mb-1" style={hintStyle}>
            {type === 'knowledge' ? '通过次数' : '有效提交'}
          </p>
          <p className="text-2xl font-medium" style={labelStyle}>
            {stats.passed}
          </p>
        </div>
      </div>

      <div
        className="bg-white p-4 rounded-lg border mb-4"
        style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
      >
        <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
          <label className="flex-1 block">
            <span className="text-xs mb-1 block" style={hintStyle}>
              搜索大使
            </span>
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                style={hintStyle}
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="姓名或账号"
                className="w-full pl-10 pr-3 py-2 border rounded-lg text-sm outline-none"
                style={{ borderColor: 'rgba(56, 44, 37, 0.15)', color: '#382C25' }}
              />
            </div>
          </label>
          <label className="block">
            <span className="text-xs mb-1 block" style={hintStyle}>
              开始日期
            </span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm"
              style={{ borderColor: 'rgba(56, 44, 37, 0.15)', color: '#382C25' }}
            />
          </label>
          <label className="block">
            <span className="text-xs mb-1 block" style={hintStyle}>
              结束日期
            </span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm"
              style={{ borderColor: 'rgba(56, 44, 37, 0.15)', color: '#382C25' }}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void loadReports()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm border disabled:opacity-50"
              style={{ borderColor: 'rgba(56, 44, 37, 0.15)', color: '#382C25' }}
            >
              <RefreshCw className="w-4 h-4" />
              刷新
            </button>
            <button
              type="button"
              onClick={() => void handleDownload()}
              disabled={downloading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm text-white disabled:opacity-50"
              style={{ backgroundColor: '#5EC4B6' }}
            >
              <Download className="w-4 h-4" />
              {downloading ? '导出中…' : '下载表格'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p
          className="text-sm mb-4 px-3 py-2 rounded-lg"
          style={{ color: '#E85D75', backgroundColor: 'rgba(232, 93, 117, 0.08)' }}
        >
          {error}
        </p>
      )}

      <div
        className="bg-white rounded-lg border overflow-hidden"
        style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
      >
        {loading ? (
          <p className="text-sm text-center py-16" style={hintStyle}>
            加载中…
          </p>
        ) : reports.length === 0 ? (
          <p className="text-sm text-center py-16" style={hintStyle}>
            暂无考试记录。大使完成{type === 'weekly' ? '周测' : '培训测试'}并提交后，将在此显示。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px]">
              <thead style={{ backgroundColor: '#F5F5F5' }}>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium" style={hintStyle}>
                    大使
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium" style={hintStyle}>
                    角色
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium" style={hintStyle}>
                    直属上级
                  </th>
                  {type === 'weekly' && (
                    <th className="px-4 py-3 text-left text-xs font-medium" style={hintStyle}>
                      周次
                    </th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-medium" style={hintStyle}>
                    试卷
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium" style={hintStyle}>
                    得分
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium" style={hintStyle}>
                    正确率
                  </th>
                  {type === 'knowledge' && (
                    <th className="px-4 py-3 text-left text-xs font-medium" style={hintStyle}>
                      结果
                    </th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-medium" style={hintStyle}>
                    提交时间
                  </th>
                </tr>
              </thead>
              <tbody>
                {reports.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t"
                    style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
                  >
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium" style={labelStyle}>
                        {row.userName}
                      </p>
                      <p className="text-xs" style={hintStyle}>
                        {row.username}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs" style={hintStyle}>
                      {row.roleLabel}
                    </td>
                    <td className="px-4 py-3 text-xs" style={hintStyle}>
                      {row.managerName || '—'}
                    </td>
                    {type === 'weekly' && (
                      <td className="px-4 py-3 text-xs" style={hintStyle}>
                        {row.weekStartDate || '—'}
                      </td>
                    )}
                    <td className="px-4 py-3 text-xs" style={hintStyle}>
                      {row.bankTitle}
                    </td>
                    <td className="px-4 py-3 text-sm" style={labelStyle}>
                      {row.score}/{row.totalScore}
                      <span className="text-xs ml-1" style={hintStyle}>
                        ({row.correctCount}/{row.questionCount} 题)
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm" style={labelStyle}>
                      {row.percent.toFixed(1)}%
                    </td>
                    {type === 'knowledge' && (
                      <td className="px-4 py-3">
                        <span
                          className="text-xs px-2 py-1 rounded"
                          style={{
                            backgroundColor: row.passed
                              ? 'rgba(94, 196, 182, 0.15)'
                              : 'rgba(232, 93, 117, 0.1)',
                            color: row.passed ? '#2D8F82' : '#E85D75',
                          }}
                        >
                          {row.passed ? '通过' : '未通过'}
                        </span>
                      </td>
                    )}
                    <td className="px-4 py-3 text-xs whitespace-nowrap" style={hintStyle}>
                      {formatDateTime(row.submittedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
