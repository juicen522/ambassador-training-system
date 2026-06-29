import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { Search, Clock, Users, List, BarChart3, X, Download } from 'lucide-react';
import { downloadExcelSheet, excelFilename } from '../lib/exportExcel';
import { useUser } from '../contexts/UserContext';
import {
  fetchAdminAmbassadorStats,
  fetchAdminServiceList,
  updateServiceRequestAdmin,
} from '../lib/serviceRequestApi';
import type {
  AmbassadorServiceStat,
  ServiceRequest,
  ServiceRequestStatus,
} from '../types/serviceRequest';

const labelStyle = { color: '#382C25' };
const hintStyle = { color: '#7A6E68' };
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

function languageLabel(lang: string) {
  return lang === 'en' ? '英文' : '中文';
}

const MANUAL_POINTS_LABEL = '需人工核算';

function isPendingManualRecord(r: ServiceRequest) {
  return Boolean(r.pointsManualRequired && r.manualPoints == null);
}

/** 按大使统计：节假日已接单/已完成但未填写人工积分的场次数 */
function countPendingManualByAmbassador(requests: ServiceRequest[]) {
  const pendingByAmbassador = new Map<string, number>();
  for (const r of requests) {
    if (!isPendingManualRecord(r)) continue;
    for (const amb of r.ambassadors ?? []) {
      pendingByAmbassador.set(
        amb.id,
        (pendingByAmbassador.get(amb.id) ?? 0) + 1,
      );
    }
  }
  return pendingByAmbassador;
}

/** 与后端统计对齐；以参观记录为准，避免旧接口返回 0 导致标注提前消失 */
function enrichAmbassadorPendingCounts(
  ambassadors: AmbassadorServiceStat[],
  allRequests: ServiceRequest[],
): AmbassadorServiceStat[] {
  const pendingByAmbassador = countPendingManualByAmbassador(allRequests);
  return ambassadors.map((a) => ({
    ...a,
    pendingManualCount: Math.max(
      a.pendingManualCount ?? 0,
      pendingByAmbassador.get(a.id) ?? 0,
    ),
  }));
}

function ManualPointsPendingBanner({
  count,
  ambassadorNames,
  className = '',
}: {
  count: number;
  ambassadorNames: string[];
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={`inline-flex flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-1 rounded-lg text-xs font-medium border ${className}`}
      style={manualBadgeStyle}
    >
      <span>
        {count} 条节假日 · {MANUAL_POINTS_LABEL}
      </span>
      {ambassadorNames.length > 0 && (
        <span style={{ opacity: 0.85 }}>{ambassadorNames.join('、')}</span>
      )}
    </span>
  );
}

const manualBadgeStyle = {
  color: '#B45309',
  borderColor: 'rgba(180, 83, 9, 0.35)',
  backgroundColor: 'rgba(251, 191, 36, 0.15)',
} as const;

/** 已填写的人工核算积分：下划线标识为人工录入 */
const manualPointsValueStyle = {
  color: '#E8A838',
  textDecoration: 'underline',
  textUnderlineOffset: '3px',
  textDecorationThickness: '1.5px',
} as const;

function servicePointsExportValue(r: ServiceRequest) {
  if (r.manualPoints != null) return r.manualPoints;
  if (r.pointsManualRequired) return MANUAL_POINTS_LABEL;
  if (r.servicePoints != null) return r.servicePoints;
  return '';
}

function ManualPointsEditor({
  request,
  onSaved,
  compact = false,
}: {
  request: ServiceRequest;
  onSaved: (updated: ServiceRequest) => void;
  compact?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const filled = request.manualPoints != null;

  const startEdit = (e: MouseEvent) => {
    e.stopPropagation();
    setValue(filled ? String(request.manualPoints) : '');
    setEditing(true);
  };

  const save = async (e: MouseEvent) => {
    e.stopPropagation();
    const trimmed = value.trim();
    if (trimmed === '') {
      if (!filled) {
        setEditing(false);
        return;
      }
      setSaving(true);
      try {
        const updated = await updateServiceRequestAdmin(request.id, {
          manualPoints: null,
        });
        setEditing(false);
        setValue('');
        onSaved(updated);
      } catch (err) {
        window.alert(err instanceof Error ? err.message : '保存失败');
      } finally {
        setSaving(false);
      }
      return;
    }
    const n = Math.round(Number(trimmed));
    if (!Number.isFinite(n) || n < 0) {
      window.alert('积分须为非负整数');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateServiceRequestAdmin(request.id, {
        manualPoints: n,
      });
      setEditing(false);
      onSaved(updated);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (!request.pointsManualRequired) {
    if (request.servicePoints != null) {
      return <span style={{ color: '#E8A838' }}>{request.servicePoints}</span>;
    }
    return <span style={hintStyle}>—</span>;
  }

  if (editing) {
    return (
      <div
        className={compact ? 'flex items-center gap-1 min-w-[7rem]' : 'space-y-2'}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <input
          type="number"
          min={0}
          step={1}
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={
            compact
              ? 'w-16 px-2 py-1 border rounded text-sm outline-none'
              : 'w-full px-3 py-2 border rounded-lg text-sm outline-none'
          }
          style={inputStyle}
        />
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="px-2 py-1 rounded text-xs text-white disabled:opacity-50 shrink-0"
          style={{ backgroundColor: '#5EC4B6' }}
        >
          {saving ? '…' : '保存'}
        </button>
        {!compact && (
          <button
            type="button"
            className="text-xs"
            style={hintStyle}
            onClick={(e) => {
              e.stopPropagation();
              setEditing(false);
            }}
          >
            取消
          </button>
        )}
      </div>
    );
  }

  if (filled) {
    return (
      <button
        type="button"
        onClick={startEdit}
        className="text-sm font-medium hover:opacity-80"
        style={manualPointsValueStyle}
        title="人工核算积分（已填写；删空后保存可恢复待核算）"
      >
        {request.servicePoints}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border cursor-pointer hover:opacity-90"
      style={manualBadgeStyle}
      title="点击填写积分"
    >
      {MANUAL_POINTS_LABEL}
    </button>
  );
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

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2 py-2 border-b text-sm" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
      <span className="text-xs shrink-0" style={hintStyle}>
        {label}
      </span>
      <span style={labelStyle}>{value}</span>
    </div>
  );
}

const exportButtonStyle = {
  borderColor: 'rgba(56, 44, 37, 0.15)',
  color: '#7A6E68',
  backgroundColor: 'white',
} as const;

function TableExportButton({
  disabled,
  onClick,
  label,
}: {
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-opacity disabled:opacity-50"
      style={exportButtonStyle}
    >
      <Download className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

export default function AdminAmbassadorServices() {
  const { allUsers } = useUser();
  const ambassadors = useMemo(
    () => allUsers.filter((u) => u.role === 'certified' || u.role === 'admin'),
    [allUsers],
  );

  const [view, setView] = useState<'stats' | 'records'>('records');
  const [totalVisitCount, setTotalVisitCount] = useState(0);
  const [totalPointsAll, setTotalPointsAll] = useState(0);
  const [stats, setStats] = useState<AmbassadorServiceStat[]>([]);
  const [allRequests, setAllRequests] = useState<ServiceRequest[]>([]);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [department, setDepartment] = useState('');
  const [ambassadorId, setAmbassadorId] = useState('');
  const [selected, setSelected] = useState<ServiceRequest | null>(null);
  const [editStatus, setEditStatus] = useState<ServiceRequestStatus>('pending');
  const [editAmbassadorIds, setEditAmbassadorIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const listFilters = {
        q: q.trim() || undefined,
        status: status === 'all' ? undefined : status,
        department: department || undefined,
        ambassadorId: ambassadorId || undefined,
      };
      const [statsRes, listData, allListData] = await Promise.all([
        fetchAdminAmbassadorStats(),
        fetchAdminServiceList(listFilters),
        fetchAdminServiceList({}),
      ]);
      setTotalVisitCount(
        listData.totalCompletedCount || statsRes.totalVisitCount || 0,
      );
      const enrichedStats = enrichAmbassadorPendingCounts(
        statsRes.ambassadors,
        allListData.requests,
      );
      setAllRequests(allListData.requests);
      setStats(enrichedStats);
      setTotalPointsAll(
        statsRes.totalPointsAll ||
          enrichedStats.reduce((sum, a) => sum + (a.totalPoints ?? 0), 0),
      );
      setRequests(listData.requests);
      setDepartments(listData.departments);
    } catch (err) {
      setTotalVisitCount(0);
      setTotalPointsAll(0);
      setStats([]);
      setAllRequests([]);
      setRequests([]);
      setLoadError(
        err instanceof Error
          ? err.message
          : '无法加载数据，请重启 npm run dev 以更新后端',
      );
    } finally {
      setLoading(false);
    }
  }, [q, status, department, ambassadorId]);

  useEffect(() => {
    const t = window.setTimeout(() => load(), 300);
    return () => window.clearTimeout(t);
  }, [load]);

  const openDetail = (r: ServiceRequest) => {
    setSelected(r);
    setEditStatus(r.status);
    setEditAmbassadorIds(r.ambassadors?.map((a) => a.id) ?? []);
  };

  const handleSaveDetail = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await updateServiceRequestAdmin(selected.id, {
        status: editStatus,
        ambassadorIds: editAmbassadorIds,
      });
      setSelected(updated);
      await load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const totalHoursAll = stats.reduce((s, a) => s + a.totalHours, 0);

  const globalPendingRecords = useMemo(
    () => allRequests.filter(isPendingManualRecord),
    [allRequests],
  );

  const globalPendingCount = globalPendingRecords.length;

  const globalPendingAmbassadorNames = useMemo(() => {
    const names = new Set<string>();
    for (const r of globalPendingRecords) {
      for (const a of r.ambassadors ?? []) names.add(a.name);
    }
    return [...names];
  }, [globalPendingRecords]);

  const pendingManualAmbassadors = useMemo(
    () => stats.filter((a) => (a.pendingManualCount ?? 0) > 0),
    [stats],
  );

  const handlePointsSaved = useCallback(
    (updated: ServiceRequest) => {
      const merge = (list: ServiceRequest[]) =>
        list.map((r) => (r.id === updated.id ? updated : r));
      const nextAll = merge(allRequests);
      setAllRequests(nextAll);
      setRequests((prev) => merge(prev));
      setStats((prev) =>
        enrichAmbassadorPendingCounts(prev, nextAll),
      );
      setSelected((prev) => (prev?.id === updated.id ? updated : prev));
      void load();
    },
    [allRequests, load],
  );

  const rankingRows = (): (string | number)[][] => [
    ['排名', '大使', '服务次数', '累计时长(小时)', '累计积分'],
    ...stats.map((a, index) => [
      index + 1,
      (a.pendingManualCount ?? 0) > 0
        ? `${a.name}（${MANUAL_POINTS_LABEL}）`
        : a.name,
      a.serviceCount,
      a.totalHours,
      a.totalPoints ?? 0,
    ]),
  ];

  const exportStatsRanking = () => {
    if (loading) return;
    if (stats.length === 0) {
      window.alert('暂无大使数据可导出');
      return;
    }
    downloadExcelSheet(excelFilename('大使时长排行'), '时长排行', rankingRows());
  };

  const exportVisitRecords = () => {
    if (loading) return;
    if (requests.length === 0) {
      window.alert('暂无参观记录可导出');
      return;
    }
    const rows: (string | number)[][] = [
      [
        '参观团体',
        '需求发起人',
        '需求部门',
        '成本中心',
        '讲解开始',
        '讲解结束',
        '服务时长(小时)',
        '本场积分',
        '积分核算',
        '日期类型',
        '讲解语言',
        '访客人数',
        '需要大使(人)',
        '预计收费(元)',
        '路线类型',
        '路线说明',
        '参观原因',
        '设备',
        '服务大使',
        '状态',
        '备注',
        '提交账号',
        '提交时间',
      ],
      ...requests.map((r) => [
        r.visitGroup,
        r.initiatorName,
        r.department,
        r.costCenter || '',
        formatDt(r.startAt),
        formatDt(r.endAt),
        r.durationHours ?? '',
        servicePointsExportValue(r),
        r.manualPoints != null ? '已填写' : r.pointsManualRequired ? MANUAL_POINTS_LABEL : '自动',
        dayTypeLabel(r.dayType),
        languageLabel(r.language),
        r.visitorCount,
        r.ambassadorCount,
        r.estimatedFee,
        routeTypeLabel(r.routeType),
        r.routeDetail || '',
        r.visitReason || '',
        equipmentLabel(r.equipment),
        r.ambassadors?.length ? r.ambassadors.map((a) => a.name).join('、') : '',
        statusLabel(r.status),
        r.remarks || '',
        r.createdByName || '',
        r.submittedAt ? formatDt(r.submittedAt) : formatDt(r.createdAt),
      ]),
    ];
    downloadExcelSheet(excelFilename('参观记录'), '参观记录', rows);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium" style={labelStyle}>
            大使服务管理
          </h2>
          <p className="text-xs mt-1" style={hintStyle}>
            查看每次参观明细、累计服务时长；可为需求单指定服务大使并更新状态
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            onClick={() => setView('records')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm border transition-all"
            style={{
              borderColor: view === 'records' ? '#5EC4B6' : 'rgba(56, 44, 37, 0.15)',
              backgroundColor: view === 'records' ? 'rgba(94, 196, 182, 0.12)' : 'white',
              color: view === 'records' ? '#5EC4B6' : '#7A6E68',
            }}
          >
            <List className="w-4 h-4" />
            参观记录
          </button>
          <button
            type="button"
            onClick={() => setView('stats')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm border transition-all"
            style={{
              borderColor: view === 'stats' ? '#5EC4B6' : 'rgba(56, 44, 37, 0.15)',
              backgroundColor: view === 'stats' ? 'rgba(94, 196, 182, 0.12)' : 'white',
              color: view === 'stats' ? '#5EC4B6' : '#7A6E68',
            }}
          >
            <BarChart3 className="w-4 h-4" />
            时长排行
          </button>
        </div>
      </div>

      {loadError && (
        <div
          className="px-4 py-3 rounded-lg text-sm border"
          style={{
            borderColor: 'rgba(232, 93, 117, 0.35)',
            backgroundColor: 'rgba(232, 93, 117, 0.08)',
            color: '#382C25',
          }}
        >
          {loadError}
          <span className="block text-xs mt-1" style={hintStyle}>
            请在终端停止 dev 后重新执行 npm run dev，确保后端包含「大使服务」接口。
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border p-4" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
          <p className="text-xs mb-1" style={hintStyle}>
            已计入时长（已接受/已完成）
          </p>
          <p className="text-2xl font-medium" style={{ color: '#5EC4B6' }}>
            {totalHoursAll.toFixed(1)} h
          </p>
        </div>
        <div className="bg-white rounded-lg border p-4" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
          <p className="text-xs mb-1" style={hintStyle}>
            累计参观次数
          </p>
          <p className="text-2xl font-medium" style={labelStyle}>
            {totalVisitCount}
          </p>
        </div>
        <div className="bg-white rounded-lg border p-4" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
          <p className="text-xs mb-1 flex flex-wrap items-center gap-2" style={hintStyle}>
            <span>累计积分</span>
            {globalPendingCount > 0 && (
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border"
                style={manualBadgeStyle}
              >
                待核算
              </span>
            )}
          </p>
          <p className="text-2xl font-medium" style={{ color: '#E8A838' }}>
            {totalPointsAll}
          </p>
        </div>
        <div className="bg-white rounded-lg border p-4" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
          <p className="text-xs mb-1" style={hintStyle}>
            有服务记录的大使
          </p>
          <p className="text-2xl font-medium" style={labelStyle}>
            {stats.filter((s) => s.serviceCount > 0).length}
          </p>
        </div>
      </div>

      {view === 'stats' ? (
        <div className="bg-white rounded-lg border overflow-hidden" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
          <div
            className="px-6 py-4 border-b flex flex-wrap items-center justify-between gap-3"
            style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
          >
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" style={{ color: '#5EC4B6' }} />
              <span className="text-sm font-medium" style={labelStyle}>
                大使服务统计（按时长降序）
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <ManualPointsPendingBanner
                count={globalPendingCount}
                ambassadorNames={pendingManualAmbassadors.map((a) =>
                  (a.pendingManualCount ?? 0) > 1
                    ? `${a.name}（${a.pendingManualCount}）`
                    : a.name,
                )}
                className="max-w-md"
              />
              <TableExportButton
                disabled={loading || stats.length === 0}
                onClick={exportStatsRanking}
                label="导出排行"
              />
            </div>
          </div>
          {loading ? (
            <p className="p-8 text-sm text-center" style={hintStyle}>
              加载中…
            </p>
          ) : (
            <table className="w-full">
              <thead style={{ backgroundColor: '#F5F5F5' }}>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium w-12" style={hintStyle}>
                    排名
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium" style={hintStyle}>
                    大使
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium" style={hintStyle}>
                    服务次数
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium" style={hintStyle}>
                    累计时长
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium" style={hintStyle}>
                    累计积分
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium" style={hintStyle}>
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.map((a, index) => (
                  <tr
                    key={a.id}
                    className="border-t"
                    style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
                  >
                    <td className="px-6 py-4 text-sm" style={hintStyle}>
                      {index + 1}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium" style={labelStyle}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{a.name}</span>
                        {(a.pendingManualCount ?? 0) > 0 && (
                          <button
                            type="button"
                            title="查看待核算记录"
                            onClick={() => {
                              setAmbassadorId(a.id);
                              setView('records');
                            }}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border cursor-pointer hover:opacity-90 shrink-0"
                            style={manualBadgeStyle}
                          >
                            {MANUAL_POINTS_LABEL}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm" style={hintStyle}>
                      {a.serviceCount}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium" style={{ color: '#5EC4B6' }}>
                      {a.totalHours} h
                    </td>
                    <td className="px-6 py-4 text-sm font-medium" style={{ color: '#E8A838' }}>
                      {a.totalPoints ?? 0}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        className="text-xs"
                        style={{ color: '#5EC4B6' }}
                        onClick={() => {
                          setAmbassadorId(a.id);
                          setView('records');
                        }}
                      >
                        查看记录
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="flex gap-6 items-start">
          <div className="flex-1 min-w-0 space-y-4">
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
                  placeholder="搜索发起人、团体、部门、备注…"
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
              <select
                value={ambassadorId}
                onChange={(e) => setAmbassadorId(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm outline-none min-w-[140px]"
                style={inputStyle}
              >
                <option value="">全部大使</option>
                {ambassadors.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            <div
              className="bg-white rounded-lg border overflow-hidden"
              style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
            >
              <div
                className="px-6 py-4 border-b flex flex-wrap items-center justify-between gap-3"
                style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
              >
                <div className="flex items-center gap-2">
                  <List className="w-4 h-4" style={{ color: '#5EC4B6' }} />
                  <span className="text-sm font-medium" style={labelStyle}>
                    参观记录
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <ManualPointsPendingBanner
                    count={globalPendingCount}
                    ambassadorNames={globalPendingAmbassadorNames}
                  />
                  <TableExportButton
                    disabled={loading || requests.length === 0}
                    onClick={exportVisitRecords}
                    label="导出记录"
                  />
                </div>
              </div>
              {loading ? (
                <p className="p-8 text-sm text-center" style={hintStyle}>
                  加载中…
                </p>
              ) : requests.length === 0 ? (
                <p className="p-8 text-sm text-center" style={hintStyle}>
                  暂无匹配记录
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1100px]">
                    <thead style={{ backgroundColor: '#F5F5F5' }}>
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium" style={hintStyle}>
                          参观团体
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium" style={hintStyle}>
                          发起人 / 部门
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium" style={hintStyle}>
                          成本中心
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium" style={hintStyle}>
                          讲解语言
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium" style={hintStyle}>
                          讲解时间
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium" style={hintStyle}>
                          时长
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium" style={hintStyle}>
                          本场积分
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium" style={hintStyle}>
                          服务大使
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
                          className="border-t cursor-pointer transition-colors"
                          style={{
                            borderColor: 'rgba(56, 44, 37, 0.06)',
                            backgroundColor:
                              selected?.id === r.id
                                ? 'rgba(94, 196, 182, 0.08)'
                                : 'transparent',
                          }}
                          onMouseEnter={(e) => {
                            if (selected?.id !== r.id) {
                              e.currentTarget.style.backgroundColor = '#FAFAFA';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (selected?.id !== r.id) {
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }
                          }}
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
                            {r.costCenter || '—'}
                          </td>
                          <td className="px-4 py-3 text-xs" style={hintStyle}>
                            {languageLabel(r.language)}
                          </td>
                          <td className="px-4 py-3 text-xs" style={hintStyle}>
                            {formatDt(r.startAt)}
                            <br />
                            <span className="text-[11px]">至 {formatDt(r.endAt)}</span>
                          </td>
                          <td className="px-4 py-3 text-sm font-medium tabular-nums" style={labelStyle}>
                            {r.actualDurationHours != null
                              ? `${r.actualDurationHours} h`
                              : '—'}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium">
                            <ManualPointsEditor
                              request={r}
                              compact
                              onSaved={handlePointsSaved}
                            />
                          </td>
                          <td className="px-4 py-3 text-xs" style={hintStyle}>
                            {r.ambassadors?.length
                              ? r.ambassadors.map((a) => a.name).join('、')
                              : '未指定'}
                          </td>
                          <td className="px-4 py-3 text-xs" style={{ color: '#5EC4B6' }}>
                            {statusLabel(r.status)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {selected && (
            <div
              className="w-full lg:w-[380px] shrink-0 bg-white rounded-lg border sticky top-4 max-h-[calc(100vh-8rem)] overflow-y-auto"
              style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
            >
              <div
                className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white z-10"
                style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
              >
                <span className="text-sm font-medium" style={labelStyle}>
                  参观详情
                </span>
                <button type="button" onClick={() => setSelected(null)} className="p-1">
                  <X className="w-4 h-4" style={hintStyle} />
                </button>
              </div>
              <div className="px-5 py-3">
                <DetailRow label="参观团体" value={selected.visitGroup} />
                <DetailRow label="需求发起人" value={selected.initiatorName} />
                <DetailRow label="需求部门" value={selected.department} />
                <DetailRow label="成本中心" value={selected.costCenter || '—'} />
                <DetailRow label="提交账号" value={selected.createdByName || '—'} />
                <DetailRow label="讲解开始" value={formatDt(selected.startAt)} />
                <DetailRow label="讲解结束" value={formatDt(selected.endAt)} />
                <DetailRow
                  label="服务时长"
                  value={
                    selected.durationHours != null
                      ? `${selected.durationHours} 小时`
                      : '—'
                  }
                />
                <DetailRow
                  label="本场积分"
                  value={
                    <ManualPointsEditor
                      request={selected}
                      onSaved={handlePointsSaved}
                    />
                  }
                />
                <DetailRow
                  label="日期类型"
                  value={
                    selected.dayType === 'holiday' ? (
                      <span className="inline-flex flex-wrap items-center gap-2">
                        {dayTypeLabel(selected.dayType)}
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border"
                          style={manualBadgeStyle}
                        >
                          {MANUAL_POINTS_LABEL}
                        </span>
                      </span>
                    ) : (
                      dayTypeLabel(selected.dayType)
                    )
                  }
                />
                <DetailRow label="讲解语言" value={languageLabel(selected.language)} />
                <DetailRow label="访客人数" value={selected.visitorCount} />
                <DetailRow label="需要大使" value={`${selected.ambassadorCount} 人`} />
                <DetailRow label="预计收费" value={`¥ ${selected.estimatedFee}`} />
                <DetailRow label="参观原因" value={selected.visitReason || '—'} />
                <DetailRow label="设备需求" value={equipmentLabel(selected.equipment)} />
                <DetailRow label="路线" value={selected.routeType === 'custom' ? '定制线' : '常规线'} />
                <DetailRow
                  label="路线说明"
                  value={
                    <span className="text-xs leading-relaxed block">{selected.routeDetail}</span>
                  }
                />
                <DetailRow label="备注" value={selected.remarks || '—'} />
                <DetailRow label="提交时间" value={formatDt(selected.submittedAt || selected.createdAt)} />

                <div className="pt-4 space-y-3">
                  <div>
                    <label className="block text-xs mb-1.5" style={hintStyle}>
                      状态
                    </label>
                    <select
                      value={editStatus}
                      onChange={(e) =>
                        setEditStatus(e.target.value as ServiceRequestStatus)
                      }
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                      style={inputStyle}
                    >
                      <option value="pending">待处理</option>
                      <option value="accepted">已接受</option>
                      <option value="completed">已完成</option>
                      <option value="cancelled">已取消</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs mb-1.5" style={hintStyle}>
                      指定服务大使（计入累计时长需设为已接受/已完成）
                    </label>
                    <div
                      className="border rounded-lg p-3 max-h-40 overflow-y-auto space-y-2"
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
                                setEditAmbassadorIds((prev) =>
                                  prev.filter((id) => id !== u.id),
                                );
                              }
                            }}
                          />
                          <Users className="w-3.5 h-3.5" style={hintStyle} />
                          <span style={labelStyle}>{u.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSaveDetail}
                    className="w-full py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                    style={{ backgroundColor: '#5EC4B6' }}
                  >
                    {saving ? '保存中…' : '保存'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
