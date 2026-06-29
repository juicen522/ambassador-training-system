import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle, ChevronRight, Clock } from 'lucide-react';
import { VisitDurationPicker } from './VisitDurationPicker';
import {
  combineDateAndTime,
  computeDurationHours,
  isoToTimeHm,
  visitDateYmd,
} from '../lib/datetime';
import {
  fetchMyAssignedServiceRequests,
  rejectServiceAssignment,
  reportServiceVisitDuration,
} from '../lib/serviceRequestApi';
import type { ServiceRequest } from '../types/serviceRequest';

const labelStyle = { color: '#382C25' };
const hintStyle = { color: '#7A6E68' };
const sectionTitleClass = 'text-[15px] font-semibold tracking-tight';

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

function languageLabel(lang: string) {
  return lang === 'en' ? '英文' : '中文';
}

function dayTypeLabel(dayType: string) {
  if (dayType === 'holiday') return '节假日';
  if (dayType === 'weekend') return '周末';
  return '工作日';
}

function equipmentLabel(eq: string) {
  if (eq === 'bee') return '小蜜蜂';
  if (eq === 'bluetooth') return '蓝牙耳机';
  return '无需设备';
}

function routeTypeLabel(routeType: string) {
  return routeType === 'custom' ? '自定义路线' : '常规路线';
}

function defaultActualTimes(request: ServiceRequest) {
  const dateYmd = visitDateYmd(request.startAt);
  let startTime = isoToTimeHm(request.startAt);
  let endTime = isoToTimeHm(request.endAt);

  if (request.actualDurationHours != null && startTime) {
    const startAt = combineDateAndTime(dateYmd, startTime);
    if (startAt) {
      const end = new Date(
        new Date(startAt).getTime() + request.actualDurationHours * 3600000,
      );
      endTime = isoToTimeHm(end.toISOString());
    }
  }

  const startAt = combineDateAndTime(dateYmd, startTime);
  const endAt = combineDateAndTime(dateYmd, endTime);
  const durationHours =
    request.actualDurationHours != null
      ? String(request.actualDurationHours)
      : startAt && endAt
        ? String(computeDurationHours(startAt, endAt) || '')
        : request.plannedDurationHours != null
          ? String(request.plannedDurationHours)
          : '';

  return { startTime, endTime, durationHours };
}

function isPendingTask(r: ServiceRequest) {
  return r.status === 'accepted';
}

function ReadOnlyField({
  label,
  value,
  fullWidth = false,
}: {
  label: string;
  value: ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <div className={fullWidth ? 'col-span-full' : ''}>
      <p className="text-xs mb-1" style={hintStyle}>
        {label}
      </p>
      <p className="text-sm" style={labelStyle}>
        {value || '—'}
      </p>
    </div>
  );
}

function AmbassadorTaskForm({
  request,
  onBack,
  onSaved,
}: {
  request: ServiceRequest;
  onBack: () => void;
  onSaved: () => void;
}) {
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [durationHours, setDurationHours] = useState('');
  const [saving, setSaving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const isCompleted = request.status === 'completed';
  const canEditDuration = request.status === 'accepted' || isCompleted;
  const canReject = request.status === 'accepted';
  const dateYmd = visitDateYmd(request.startAt);
  const actualStartAt = combineDateAndTime(dateYmd, startTime);
  const actualEndAt = combineDateAndTime(dateYmd, endTime);

  useEffect(() => {
    const defaults = defaultActualTimes(request);
    setStartTime(defaults.startTime);
    setEndTime(defaults.endTime);
    setDurationHours(defaults.durationHours);
  }, [request]);

  const handleReject = async () => {
    const reason = window.prompt(
      '拒绝派单后，需求将退回管理员重新安排。可填写拒绝原因（选填）：',
    );
    if (reason === null) return;
    setRejecting(true);
    try {
      await rejectServiceAssignment(request.id, reason);
      onSaved();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '拒绝失败');
    } finally {
      setRejecting(false);
    }
  };

  const computedDurationHours = useMemo(() => {
    if (!actualStartAt || !actualEndAt) return 0;
    return computeDurationHours(actualStartAt, actualEndAt);
  }, [actualStartAt, actualEndAt]);

  const submitDuration = async () => {
    if (!startTime || !endTime) {
      window.alert('请选择讲解开始与结束时间');
      return;
    }
    if (computedDurationHours <= 0) {
      window.alert('讲解结束时间须晚于开始时间');
      return;
    }
    setSaving(true);
    try {
      await reportServiceVisitDuration(request.id, computedDurationHours);
      onSaved();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '提交失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-sm"
        style={{ color: '#5EC4B6' }}
      >
        <ArrowLeft className="w-4 h-4" />
        返回参观列表
      </button>

      <section
        className="bg-white rounded-lg border px-6 py-5"
        style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
      >
        <h3 className={`${sectionTitleClass} mb-4`} style={labelStyle}>
          一、需求信息
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ReadOnlyField label="需求部门发起人" value={request.initiatorName} />
          <ReadOnlyField label="需求部门" value={request.department} />
          <ReadOnlyField label="成本中心" value={request.costCenter} />
          <ReadOnlyField label="参观团体" value={request.visitGroup} />
          <ReadOnlyField label="参观原因" value={request.visitReason} />
          <ReadOnlyField label="访客人数" value={`${request.visitorCount} 人`} />
          <ReadOnlyField label="需要大使人数" value={`${request.ambassadorCount} 人`} />
        </div>
      </section>

      <section
        className="bg-white rounded-lg border px-6 py-5"
        style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
      >
        <h3 className={`${sectionTitleClass} mb-4`} style={labelStyle}>
          二、讲解安排
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ReadOnlyField label="讲解开始时间" value={formatDt(request.startAt)} />
          <ReadOnlyField label="讲解结束时间" value={formatDt(request.endAt)} />
          <ReadOnlyField
            label="计划参观时长"
            value={
              request.plannedDurationHours != null
                ? `${request.plannedDurationHours} 小时`
                : '—'
            }
          />
          <ReadOnlyField label="讲解语言" value={languageLabel(request.language)} />
          <ReadOnlyField label="日期类型" value={dayTypeLabel(request.dayType)} />
          <ReadOnlyField label="设备需求" value={equipmentLabel(request.equipment)} />
          <ReadOnlyField label="路线类型" value={routeTypeLabel(request.routeType)} />
          <ReadOnlyField
            label="路线说明"
            value={request.routeDetail}
            fullWidth
          />
          <ReadOnlyField label="备注" value={request.remarks} fullWidth />
        </div>
      </section>

      <section
        className="bg-white rounded-lg border px-6 py-5 space-y-4"
        style={{
          borderColor: isCompleted
            ? 'rgba(94, 196, 182, 0.35)'
            : 'rgba(251, 191, 36, 0.35)',
          backgroundColor: isCompleted
            ? 'rgba(94, 196, 182, 0.04)'
            : 'rgba(251, 191, 36, 0.06)',
        }}
      >
        <h3 className={`${sectionTitleClass}`} style={labelStyle}>
          三、参观结束后填写（由服务大使填写）
        </h3>

        <div>
          {canEditDuration ? (
            <VisitDurationPicker
              fixedDateIso={request.startAt}
              startTime={startTime}
              endTime={endTime}
              durationHours={durationHours}
              onStartTimeChange={setStartTime}
              onEndTimeChange={setEndTime}
              onDurationHoursChange={setDurationHours}
            />
          ) : (
            <ReadOnlyField
              label="实际参观时长"
              value={
                request.actualDurationHours != null
                  ? `${request.actualDurationHours} 小时`
                  : '—'
              }
            />
          )}

          {isCompleted && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <ReadOnlyField
                label="时长提交时间"
                value={
                  request.actualDurationReportedAt
                    ? formatDt(request.actualDurationReportedAt)
                    : '—'
                }
              />
              <ReadOnlyField
                label="本场积分"
                value={
                  request.pointsManualRequired && request.manualPoints == null ? (
                    <span style={{ color: '#B45309' }}>节假日 · 待管理员人工核算</span>
                  ) : request.servicePoints != null ? (
                    <span style={{ color: '#E8A838' }}>{request.servicePoints} 分</span>
                  ) : (
                    '—'
                  )
                }
              />
            </div>
          )}
        </div>

        {(canEditDuration || canReject) && (
          <div className="flex flex-wrap items-center gap-3 pt-2">
            {canEditDuration && (
              <button
                type="button"
                disabled={saving || rejecting || computedDurationHours <= 0}
                onClick={submitDuration}
                className="px-6 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: '#5EC4B6' }}
              >
                {saving
                  ? '提交中…'
                  : isCompleted
                    ? '保存实际时长'
                    : '提交实际时长并完成服务'}
              </button>
            )}
            {canReject && !isCompleted && (
              <button
                type="button"
                disabled={saving || rejecting}
                onClick={() => void handleReject()}
                className="px-6 py-2.5 rounded-lg text-sm font-medium border disabled:opacity-50"
                style={{
                  borderColor: 'rgba(232, 93, 117, 0.45)',
                  color: '#E85D75',
                  backgroundColor: 'white',
                }}
              >
                {rejecting ? '处理中…' : '拒绝派单'}
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function VisitListCard({
  request,
  onClick,
}: {
  request: ServiceRequest;
  onClick: () => void;
}) {
  const pending = isPendingTask(request);
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-white rounded-lg border px-5 py-4 transition-all hover:shadow-sm"
      style={{ borderColor: 'rgba(56, 44, 37, 0.08)' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#5EC4B6';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(56, 44, 37, 0.08)';
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <p className="text-sm font-medium truncate" style={labelStyle}>
              {request.visitGroup}
            </p>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
              style={{
                backgroundColor: pending
                  ? 'rgba(251, 191, 36, 0.2)'
                  : 'rgba(94, 196, 182, 0.15)',
                color: pending ? '#B45309' : '#5EC4B6',
              }}
            >
              {pending ? '待完成' : '已完成'}
            </span>
          </div>
          <p className="text-xs" style={hintStyle}>
            {request.department} · {request.initiatorName}
          </p>
          <p className="text-xs mt-1" style={hintStyle}>
            讲解时间：{formatDt(request.startAt)}
            {request.actualDurationHours != null
              ? ` · 实际 ${request.actualDurationHours} 小时`
              : request.plannedDurationHours != null
                ? ` · 计划 ${request.plannedDurationHours} 小时`
                : ''}
          </p>
        </div>
        <ChevronRight className="w-5 h-5 shrink-0 mt-0.5" style={{ color: '#7A6E68' }} />
      </div>
    </button>
  );
}

export default function AmbassadorMyTasks() {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [listTab, setListTab] = useState<'pending' | 'completed'>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const list = await fetchMyAssignedServiceRequests();
      setRequests(list);
      const pending = list.filter(isPendingTask);
      const done = list.filter((r) => r.status === 'completed');
      setListTab((tab) => {
        if (tab === 'pending' && pending.length === 0 && done.length > 0) {
          return 'completed';
        }
        if (tab === 'completed' && done.length === 0 && pending.length > 0) {
          return 'pending';
        }
        return tab;
      });
      setSelectedId((prev) => {
        if (prev && list.some((r) => r.id === prev)) return prev;
        return null;
      });
    } catch (err) {
      setRequests([]);
      setSelectedId(null);
      setView('list');
      setLoadError(err instanceof Error ? err.message : '加载讲解任务失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingTasks = requests.filter(isPendingTask);
  const doneTasks = requests.filter((r) => r.status === 'completed');
  const selected = requests.find((r) => r.id === selectedId) ?? null;

  const openDetail = (id: string) => {
    setSelectedId(id);
    setView('detail');
  };

  const backToList = () => {
    setView('list');
    setSelectedId(null);
  };

  const handleSaved = async () => {
    await load();
    setView('list');
    setSelectedId(null);
  };

  if (view === 'detail' && selected) {
    return (
      <div className="space-y-4">
        <AmbassadorTaskForm
          key={selected.id}
          request={selected}
          onBack={backToList}
          onSaved={handleSaved}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {loadError && (
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
      )}

      {loading ? (
        <p className="text-sm text-center py-12" style={hintStyle}>
          加载中…
        </p>
      ) : requests.length === 0 ? (
        <div
          className="bg-white rounded-lg border p-12 text-center text-sm"
          style={{ borderColor: 'rgba(56, 44, 37, 0.06)', ...hintStyle }}
        >
          <p>暂无派发给您的讲解任务</p>
          <p className="text-xs mt-3 max-w-md mx-auto" style={hintStyle}>
            请使用「王芳」账号登录，并由管理员派单给该大使。
          </p>
        </div>
      ) : (
        <div className="space-y-4 max-w-2xl">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setListTab('pending')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm border transition-all"
              style={{
                borderColor:
                  listTab === 'pending' ? '#5EC4B6' : 'rgba(56, 44, 37, 0.15)',
                backgroundColor:
                  listTab === 'pending' ? 'rgba(94, 196, 182, 0.12)' : 'white',
                color: listTab === 'pending' ? '#5EC4B6' : '#7A6E68',
              }}
            >
              <Clock className="w-4 h-4" />
              待完成的参观
              {pendingTasks.length > 0 && (
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: 'rgba(232, 168, 56, 0.25)', color: '#B45309' }}
                >
                  {pendingTasks.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setListTab('completed')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm border transition-all"
              style={{
                borderColor:
                  listTab === 'completed' ? '#5EC4B6' : 'rgba(56, 44, 37, 0.15)',
                backgroundColor:
                  listTab === 'completed' ? 'rgba(94, 196, 182, 0.12)' : 'white',
                color: listTab === 'completed' ? '#5EC4B6' : '#7A6E68',
              }}
            >
              <CheckCircle className="w-4 h-4" />
              已完成的参观
              {doneTasks.length > 0 && (
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: 'rgba(94, 196, 182, 0.2)' }}
                >
                  {doneTasks.length}
                </span>
              )}
            </button>
          </div>

          {listTab === 'pending' ? (
            pendingTasks.length === 0 ? (
              <div
                className="bg-white rounded-lg border p-10 text-center text-sm"
                style={{ borderColor: 'rgba(56, 44, 37, 0.06)', ...hintStyle }}
              >
                暂无待完成的参观
              </div>
            ) : (
              <div className="space-y-2">
                {pendingTasks.map((r) => (
                  <VisitListCard key={r.id} request={r} onClick={() => openDetail(r.id)} />
                ))}
              </div>
            )
          ) : doneTasks.length === 0 ? (
            <div
              className="bg-white rounded-lg border p-10 text-center text-sm"
              style={{ borderColor: 'rgba(56, 44, 37, 0.06)', ...hintStyle }}
            >
              暂无已完成的参观
            </div>
          ) : (
            <div className="space-y-2">
              {doneTasks.map((r) => (
                <VisitListCard key={r.id} request={r} onClick={() => openDetail(r.id)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
