import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Search, Users } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import {
  fetchAdminServiceList,
  returnServiceRequestToCreator,
  updateServiceRequestAdmin,
} from '../lib/serviceRequestApi';
import type {
  ServiceRequest,
  ServiceRequestStatus,
} from '../types/serviceRequest';

const labelStyle = { color: '#382C25' };
const hintStyle = { color: '#7A6E68' };
const sectionTitleClass = 'text-[15px] font-semibold tracking-tight';
const inputStyle = {
  borderColor: 'rgba(56, 44, 37, 0.15)',
  color: '#382C25',
  backgroundColor: 'white',
};

const STATUS_OPTIONS: { id: ServiceRequestStatus | 'all'; label: string }[] = [
  { id: 'all', label: '全部状态' },
  { id: 'pending', label: '待处理' },
  { id: 'accepted', label: '已接受' },
  { id: 'completed', label: '已完成' },
  { id: 'cancelled', label: '已取消' },
];

function statusLabel(status: ServiceRequestStatus) {
  return STATUS_OPTIONS.find((s) => s.id === status)?.label ?? status;
}

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

function ReadOnlyField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs mb-1" style={hintStyle}>
        {label}
      </p>
      <p className="text-sm" style={labelStyle}>
        {value || '—'}
      </p>
    </div>
  );
}

function statusBadge(status: ServiceRequestStatus) {
  const pending = status === 'pending';
  return (
    <span
      className="text-xs px-2 py-0.5 rounded"
      style={{
        backgroundColor: pending ? 'rgba(251, 191, 36, 0.2)' : 'rgba(94, 196, 182, 0.15)',
        color: pending ? '#B45309' : '#5EC4B6',
      }}
    >
      {statusLabel(status)}
    </span>
  );
}

export default function AdminServiceRequests() {
  const { allUsers } = useUser();
  const ambassadors = useMemo(
    () => allUsers.filter((u) => u.role === 'certified' || u.role === 'admin'),
    [allUsers],
  );

  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>('pending');
  const [department, setDepartment] = useState('');
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editAmbassadorIds, setEditAmbassadorIds] = useState<string[]>([]);
  const [saveMessage, setSaveMessage] = useState('');
  const [returning, setReturning] = useState(false);

  const selected = useMemo(
    () => requests.find((r) => r.id === selectedId) ?? null,
    [requests, selectedId],
  );

  const pendingCount = useMemo(
    () => requests.filter((r) => r.status === 'pending').length,
    [requests],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await fetchAdminServiceList({
        q: q.trim() || undefined,
        status: status === 'all' ? undefined : status,
        department: department || undefined,
      });
      setRequests(data.requests);
      setDepartments(data.departments);
    } catch (err) {
      setRequests([]);
      setLoadError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [q, status, department]);

  useEffect(() => {
    const t = window.setTimeout(() => load(), 300);
    return () => window.clearTimeout(t);
  }, [load]);

  const openDetail = (r: ServiceRequest) => {
    setSelectedId(r.id);
    setEditAmbassadorIds(r.ambassadors?.map((a) => a.id) ?? []);
    setSaveMessage('');
    setView('detail');
  };

  const backToList = () => {
    setView('list');
    setSelectedId(null);
    setSaveMessage('');
  };

  const handleSaveDetail = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await updateServiceRequestAdmin(selected.id, {
        ambassadorIds: editAmbassadorIds,
      });
      setSelectedId(updated.id);
      setEditAmbassadorIds(updated.ambassadors?.map((a) => a.id) ?? []);
      setSaveMessage(
        updated.status === 'accepted'
          ? '已派单给指定大使'
          : editAmbassadorIds.length > 0
            ? '已保存大使选择'
            : '已保存',
      );
      await load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleReturnToCreator = async () => {
    if (!selected) return;
    const reason = window.prompt(
      '退回后需求将回到发起人草稿，对方会收到退回说明。请填写退回原因（选填）：',
    );
    if (reason === null) return;
    if (
      !window.confirm(
        `确认将「${selected.visitGroup || '该需求'}」退回给发起人 ${selected.initiatorName}？`,
      )
    ) {
      return;
    }
    setReturning(true);
    try {
      await returnServiceRequestToCreator(selected.id, reason);
      await load();
      backToList();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '退回失败');
    } finally {
      setReturning(false);
    }
  };

  if (view === 'detail' && selected) {
    return (
      <div className="space-y-5 max-w-3xl">
        <button
          type="button"
          onClick={backToList}
          className="flex items-center gap-1 text-sm"
          style={{ color: '#5EC4B6' }}
        >
          <ArrowLeft className="w-4 h-4" />
          返回需求列表
        </button>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-medium" style={labelStyle}>
              {selected.visitGroup || '未命名团体'}
            </h2>
            <p className="text-sm mt-1" style={hintStyle}>
              {selected.department} · {selected.initiatorName}
            </p>
          </div>
          {statusBadge(selected.status)}
        </div>

        {saveMessage && (
          <div
            className="px-4 py-3 rounded-lg text-sm border"
            style={{
              borderColor: 'rgba(94, 196, 182, 0.35)',
              backgroundColor: 'rgba(94, 196, 182, 0.08)',
              color: '#382C25',
            }}
          >
            {saveMessage}
          </div>
        )}

        <section
          className="bg-white rounded-lg border px-6 py-5 space-y-4"
          style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
        >
          <h3 className={sectionTitleClass} style={labelStyle}>
            基本信息
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ReadOnlyField label="需求部门发起人" value={selected.initiatorName} />
            <ReadOnlyField label="需求部门" value={selected.department} />
            <ReadOnlyField label="成本中心" value={selected.costCenter} />
            <ReadOnlyField label="提交账号" value={selected.createdByName} />
            <ReadOnlyField label="参观团体" value={selected.visitGroup} />
            <ReadOnlyField label="参观原因" value={selected.visitReason} />
            <ReadOnlyField label="访客人数" value={`${selected.visitorCount} 人`} />
            <ReadOnlyField label="需要大使人数" value={`${selected.ambassadorCount} 人`} />
            <ReadOnlyField label="设备需求" value={equipmentLabel(selected.equipment)} />
            <ReadOnlyField
              label="提交时间"
              value={formatDt(selected.submittedAt || selected.createdAt)}
            />
          </div>
          <ReadOnlyField label="需求部门备注" value={selected.remarks} />
        </section>

        <section
          className="bg-white rounded-lg border px-6 py-5 space-y-4"
          style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
        >
          <h3 className={sectionTitleClass} style={labelStyle}>
            讲解安排
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ReadOnlyField label="讲解开始时间" value={formatDt(selected.startAt)} />
            <ReadOnlyField label="讲解结束时间" value={formatDt(selected.endAt)} />
            <ReadOnlyField
              label="计划参观时长"
              value={
                selected.plannedDurationHours != null
                  ? `${selected.plannedDurationHours} 小时`
                  : '—'
              }
            />
            <ReadOnlyField
              label="实际参观时长"
              value={
                selected.actualDurationHours != null
                  ? `${selected.actualDurationHours} 小时`
                  : selected.status === 'accepted'
                    ? '待大使填报'
                    : '—'
              }
            />
            <ReadOnlyField label="讲解语言" value={languageLabel(selected.language)} />
            <ReadOnlyField label="日期类型" value={dayTypeLabel(selected.dayType)} />
            <ReadOnlyField label="预计收费" value={`¥ ${selected.estimatedFee}`} />
          </div>
          <ReadOnlyField
            label="参观路线"
            value={
              selected.routeType === 'custom' ? (
                <span>
                  <span className="font-medium">定制线</span>
                  <span className="block text-xs mt-1 leading-relaxed" style={hintStyle}>
                    {selected.routeDetail}
                  </span>
                </span>
              ) : (
                <span>
                  <span className="font-medium">常规线</span>
                  <span className="block text-xs mt-1 leading-relaxed" style={hintStyle}>
                    {selected.routeDetail}
                  </span>
                </span>
              )
            }
          />
        </section>

        <section
          className="bg-white rounded-lg border px-6 py-5 space-y-4"
          style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
        >
          <h3 className={sectionTitleClass} style={labelStyle}>
            派单
          </h3>
          <p className="text-xs leading-relaxed" style={hintStyle}>
            指定服务大使并保存后，需求将自动变为「已接受」，系统会同步分发给对应大使的上级（如已配置）。
          </p>
          <div>
            <label className="block text-xs mb-1.5" style={hintStyle}>
              指定服务大使
            </label>
            <div
              className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2"
              style={{ borderColor: 'rgba(56, 44, 37, 0.1)' }}
            >
              {ambassadors.map((u) => (
                <label
                  key={u.id}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={editAmbassadorIds.includes(u.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setEditAmbassadorIds((prev) => [...prev, u.id]);
                      } else {
                        setEditAmbassadorIds((prev) => prev.filter((id) => id !== u.id));
                      }
                    }}
                  />
                  <Users className="w-3.5 h-3.5" style={hintStyle} />
                  <span style={labelStyle}>
                    {u.name}
                    {u.username ? (
                      <span className="text-xs ml-1" style={hintStyle}>
                        （{u.username}）
                      </span>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
          </div>
          {selected.supervisorRecipients && selected.supervisorRecipients.length > 0 && (
            <div
              className="rounded-lg px-3 py-2 text-xs"
              style={{
                backgroundColor: 'rgba(94, 196, 182, 0.08)',
                color: '#2D8F82',
              }}
            >
              已同步上级：
              {selected.supervisorRecipients.map((u) => u.name).join('、')}
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <button
              type="button"
              disabled={saving || returning}
              onClick={handleSaveDetail}
              className="flex-1 py-3 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: '#5EC4B6' }}
            >
              {saving ? '保存中…' : '保存并派单'}
            </button>
            {['pending', 'accepted'].includes(selected.status) && (
              <button
                type="button"
                disabled={saving || returning}
                onClick={() => void handleReturnToCreator()}
                className="flex-1 py-3 rounded-lg text-sm font-medium border disabled:opacity-50"
                style={{
                  borderColor: 'rgba(232, 93, 117, 0.45)',
                  color: '#E85D75',
                  backgroundColor: 'rgba(232, 93, 117, 0.06)',
                }}
              >
                {returning ? '退回中…' : '退回需求'}
              </button>
            )}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium" style={labelStyle}>
          大使需求处理
        </h2>
        <p className="text-xs mt-1" style={hintStyle}>
          处理流程：需求部门提交 → 管理员派单指定大使 → 大使参观后填报实际时长 → 系统按实际时长统计积分（节假日需人工核算）
        </p>
      </div>

      <ol
        className="text-xs space-y-1.5 list-decimal list-inside px-4 py-3 rounded-lg border"
        style={{
          borderColor: 'rgba(94, 196, 182, 0.25)',
          backgroundColor: 'rgba(94, 196, 182, 0.06)',
          color: '#5A524C',
        }}
      >
        <li>待处理：审核需求单内容</li>
        <li>已接受：已指定服务大使，大使在「大使需求 → 我的讲解任务」中查看</li>
        <li>已完成：大使提交实际参观时长后自动完成，积分计入「参观与积分」</li>
      </ol>

      {loadError && (
        <div
          className="px-4 py-3 rounded-lg text-sm border"
          style={{
            borderColor: 'rgba(232, 93, 117, 0.35)',
            backgroundColor: 'rgba(232, 93, 117, 0.08)',
          }}
        >
          {loadError}
        </div>
      )}

      <div
        className="bg-white rounded-lg border p-4 flex flex-wrap gap-3"
        style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
      >
        <div className="relative flex-1 min-w-[200px]">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
            style={hintStyle}
          />
          <input
            type="text"
            placeholder="搜索发起人、团体、部门…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm outline-none"
            style={inputStyle}
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2 border rounded-lg text-sm outline-none"
          style={inputStyle}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className="px-3 py-2 border rounded-lg text-sm outline-none min-w-[140px]"
          style={inputStyle}
        >
          <option value="">全部部门</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <div
        className="bg-white rounded-lg border overflow-hidden"
        style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
      >
            <div
              className="px-6 py-4 border-b flex items-center justify-between"
              style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
            >
              <span className="text-sm font-medium" style={labelStyle}>
                需求列表
              </span>
              {status === 'pending' && pendingCount > 0 && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: 'rgba(251, 191, 36, 0.2)',
                    color: '#B45309',
                  }}
                >
                  {pendingCount} 条待处理
                </span>
              )}
            </div>
            {loading ? (
              <p className="p-8 text-sm text-center" style={hintStyle}>
                加载中…
              </p>
            ) : requests.length === 0 ? (
              <p className="p-8 text-sm text-center" style={hintStyle}>
                暂无匹配需求
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px]">
                  <thead style={{ backgroundColor: '#F5F5F5' }}>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium" style={hintStyle}>
                        参观团体
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium" style={hintStyle}>
                        发起人 / 部门
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium" style={hintStyle}>
                        讲解时间
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium" style={hintStyle}>
                        计划时长
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium" style={hintStyle}>
                        实际时长
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium" style={hintStyle}>
                        预计收费
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium" style={hintStyle}>
                        状态
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((r) => (
                      <tr
                        key={r.id}
                        onClick={() => openDetail(r)}
                        className="border-t cursor-pointer transition-colors hover:bg-[#FAFAFA]"
                        style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
                      >
                        <td className="px-4 py-3 text-sm font-medium" style={labelStyle}>
                          {r.visitGroup}
                        </td>
                        <td className="px-4 py-3 text-sm" style={hintStyle}>
                          {r.initiatorName}
                          <br />
                          <span className="text-xs">{r.department}</span>
                        </td>
                        <td className="px-4 py-3 text-xs" style={hintStyle}>
                          {formatDt(r.startAt)}
                        </td>
                        <td className="px-4 py-3 text-xs" style={hintStyle}>
                          {r.plannedDurationHours != null
                            ? `${r.plannedDurationHours} h`
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs" style={hintStyle}>
                          {r.actualDurationHours != null
                            ? `${r.actualDurationHours} h`
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm" style={{ color: '#E8A838' }}>
                          ¥{r.estimatedFee}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <span
                            className="px-2 py-0.5 rounded"
                            style={{
                              backgroundColor:
                                r.status === 'pending'
                                  ? 'rgba(251, 191, 36, 0.2)'
                                  : 'rgba(94, 196, 182, 0.15)',
                              color: r.status === 'pending' ? '#B45309' : '#5EC4B6',
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
