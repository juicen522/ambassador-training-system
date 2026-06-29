import { useCallback, useEffect, useMemo, useState } from 'react';
import { Award, BarChart3, Clock, ListChecks } from 'lucide-react';
import { fetchMyAmbassadorReport } from '../lib/serviceRequestApi';
import type { ServiceRequest } from '../types/serviceRequest';

const labelStyle = { color: '#382C25' };
const hintStyle = { color: '#7A6E68' };
const borderColor = 'rgba(56, 44, 37, 0.06)';

function formatDt(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusLabel(status: ServiceRequest['status']) {
  switch (status) {
    case 'pending':
      return '待处理';
    case 'accepted':
      return '待完成';
    case 'completed':
      return '已完成';
    case 'cancelled':
      return '已取消';
    default:
      return status;
  }
}

function dayTypeLabel(dayType: string) {
  if (dayType === 'holiday') return '节假日';
  if (dayType === 'weekend') return '周末';
  return '工作日';
}

function pointsCell(r: ServiceRequest) {
  if (r.status !== 'completed') return '—';
  if (r.pointsManualRequired && r.manualPoints == null) {
    return <span style={{ color: '#B45309' }}>待核算</span>;
  }
  if (r.servicePoints != null) {
    return <span style={{ color: '#E8A838' }}>{r.servicePoints}</span>;
  }
  return '—';
}

export default function AmbassadorMyReport() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [summary, setSummary] = useState({
    totalPoints: 0,
    totalHours: 0,
    completedCount: 0,
    pendingCount: 0,
    pendingManualCount: 0,
    totalAssigned: 0,
  });
  const [records, setRecords] = useState<ServiceRequest[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await fetchMyAmbassadorReport();
      setSummary(data.summary);
      setRecords(data.records);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '加载报表失败');
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const completedRecords = useMemo(
    () => records.filter((r) => r.status === 'completed'),
    [records],
  );

  const monthlyRows = useMemo(() => {
    const map = new Map<
      string,
      { month: string; sortKey: string; count: number; hours: number; points: number }
    >();
    for (const r of completedRecords) {
      const d = new Date(r.startAt);
      if (Number.isNaN(d.getTime())) continue;
      const sortKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const month = d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' });
      const row = map.get(sortKey) ?? { month, sortKey, count: 0, hours: 0, points: 0 };
      row.count += 1;
      row.hours += r.actualDurationHours ?? 0;
      if (r.servicePoints != null) row.points += r.servicePoints;
      map.set(sortKey, row);
    }
    return [...map.values()].sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  }, [completedRecords]);

  if (loading) {
    return (
      <p className="text-sm text-center py-16" style={hintStyle}>
        加载报表中…
      </p>
    );
  }

  if (loadError) {
    return (
      <div
        className="px-4 py-3 rounded-lg text-sm border"
        style={{
          borderColor: 'rgba(232, 93, 117, 0.35)',
          backgroundColor: 'rgba(232, 93, 117, 0.08)',
          color: '#E85D75',
        }}
      >
        {loadError}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border p-4" style={{ borderColor }}>
          <div className="flex items-center gap-2 mb-2">
            <Award className="w-4 h-4" style={{ color: '#E8A838' }} />
            <p className="text-xs" style={hintStyle}>
              累计积分
            </p>
          </div>
          <p className="text-2xl font-semibold" style={{ color: '#E8A838' }}>
            {summary.totalPoints}
          </p>
          {summary.pendingManualCount > 0 && (
            <p className="text-[11px] mt-1" style={{ color: '#B45309' }}>
              含 {summary.pendingManualCount} 场节假日待人工核算
            </p>
          )}
        </div>
        <div className="bg-white rounded-lg border p-4" style={{ borderColor }}>
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4" style={{ color: '#5EC4B6' }} />
            <p className="text-xs" style={hintStyle}>
              累计讲解时长
            </p>
          </div>
          <p className="text-2xl font-semibold" style={{ color: '#5EC4B6' }}>
            {summary.totalHours}{' '}
            <span className="text-sm font-medium">小时</span>
          </p>
        </div>
        <div className="bg-white rounded-lg border p-4" style={{ borderColor }}>
          <div className="flex items-center gap-2 mb-2">
            <ListChecks className="w-4 h-4" style={{ color: '#382C25' }} />
            <p className="text-xs" style={hintStyle}>
              已完成参观
            </p>
          </div>
          <p className="text-2xl font-semibold" style={labelStyle}>
            {summary.completedCount}
          </p>
        </div>
        <div className="bg-white rounded-lg border p-4" style={{ borderColor }}>
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4" style={{ color: '#7A6E68' }} />
            <p className="text-xs" style={hintStyle}>
              待完成
            </p>
          </div>
          <p className="text-2xl font-semibold" style={labelStyle}>
            {summary.pendingCount}
          </p>
        </div>
      </div>

      {monthlyRows.length > 0 && (
        <div
          className="bg-white rounded-lg border overflow-hidden"
          style={{ borderColor }}
        >
          <div
            className="px-5 py-4 border-b"
            style={{ borderColor }}
          >
            <h3 className="text-sm font-medium" style={labelStyle}>
              按月汇总（已完成）
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: '#FAFAFA' }}>
                  <th className="text-left px-5 py-3 font-medium" style={hintStyle}>
                    月份
                  </th>
                  <th className="text-right px-5 py-3 font-medium" style={hintStyle}>
                    场次
                  </th>
                  <th className="text-right px-5 py-3 font-medium" style={hintStyle}>
                    时长（小时）
                  </th>
                  <th className="text-right px-5 py-3 font-medium" style={hintStyle}>
                    积分
                  </th>
                </tr>
              </thead>
              <tbody>
                {monthlyRows.map((row) => (
                  <tr
                    key={row.sortKey}
                    className="border-t"
                    style={{ borderColor }}
                  >
                    <td className="px-5 py-3" style={labelStyle}>
                      {row.month}
                    </td>
                    <td className="px-5 py-3 text-right" style={labelStyle}>
                      {row.count}
                    </td>
                    <td className="px-5 py-3 text-right" style={{ color: '#5EC4B6' }}>
                      {Math.round(row.hours * 10) / 10}
                    </td>
                    <td className="px-5 py-3 text-right" style={{ color: '#E8A838' }}>
                      {row.points}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr
                  className="border-t font-medium"
                  style={{ borderColor, backgroundColor: 'rgba(94, 196, 182, 0.06)' }}
                >
                  <td className="px-5 py-3" style={labelStyle}>
                    合计
                  </td>
                  <td className="px-5 py-3 text-right" style={labelStyle}>
                    {summary.completedCount}
                  </td>
                  <td className="px-5 py-3 text-right" style={{ color: '#5EC4B6' }}>
                    {summary.totalHours}
                  </td>
                  <td className="px-5 py-3 text-right" style={{ color: '#E8A838' }}>
                    {summary.totalPoints}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <div
        className="bg-white rounded-lg border overflow-hidden"
        style={{ borderColor }}
      >
        <div
          className="px-5 py-4 border-b flex items-center justify-between gap-3"
          style={{ borderColor }}
        >
          <h3 className="text-sm font-medium" style={labelStyle}>
            参观明细
          </h3>
          <span className="text-xs" style={hintStyle}>
            共 {records.length} 条派单记录
          </span>
        </div>
        {records.length === 0 ? (
          <p className="text-sm text-center py-12" style={hintStyle}>
            暂无派单记录
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr style={{ backgroundColor: '#FAFAFA' }}>
                  <th className="text-left px-4 py-3 font-medium" style={hintStyle}>
                    参观团体
                  </th>
                  <th className="text-left px-4 py-3 font-medium" style={hintStyle}>
                    讲解时间
                  </th>
                  <th className="text-left px-4 py-3 font-medium" style={hintStyle}>
                    日期类型
                  </th>
                  <th className="text-right px-4 py-3 font-medium" style={hintStyle}>
                    时长
                  </th>
                  <th className="text-right px-4 py-3 font-medium" style={hintStyle}>
                    积分
                  </th>
                  <th className="text-left px-4 py-3 font-medium" style={hintStyle}>
                    状态
                  </th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t"
                    style={{ borderColor }}
                  >
                    <td className="px-4 py-3" style={labelStyle}>
                      <p className="font-medium">{r.visitGroup || '—'}</p>
                      <p className="text-xs mt-0.5" style={hintStyle}>
                        {r.department}
                      </p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap" style={hintStyle}>
                      {formatDt(r.startAt)}
                    </td>
                    <td className="px-4 py-3" style={hintStyle}>
                      {dayTypeLabel(r.dayType)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-medium tabular-nums" style={labelStyle}>
                      {r.actualDurationHours != null
                        ? `${r.actualDurationHours} h`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {pointsCell(r)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs px-2 py-0.5 rounded"
                        style={{
                          backgroundColor:
                            r.status === 'completed'
                              ? 'rgba(94, 196, 182, 0.15)'
                              : r.status === 'accepted'
                                ? 'rgba(251, 191, 36, 0.2)'
                                : 'rgba(56, 44, 37, 0.08)',
                          color:
                            r.status === 'completed'
                              ? '#5EC4B6'
                              : r.status === 'accepted'
                                ? '#B45309'
                                : '#7A6E68',
                        }}
                      >
                        {statusLabel(r.status)}
                      </span>
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
