import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  ArrowLeft,
  BarChart3,
  ClipboardList,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Save,
  Send,
  UserCheck,
  List,
} from 'lucide-react';
import AmbassadorMyTasks from './AmbassadorMyTasks';
import AmbassadorMyReport from './AmbassadorMyReport';
import SectionPageLayout from './SectionPageLayout';
import { useUser } from '../contexts/UserContext';
import { useNavigationCopy } from '../hooks/useNavigationCopy';
import type { ServiceNavigationSettings } from '../types/settings';
import {
  createServiceRequest,
  fetchServiceRequestMeta,
  cancelServiceRequest,
  listServiceRequests,
  notifyServiceRequestsUpdated,
  previewServiceFee,
  updateServiceRequest,
} from '../lib/serviceRequestApi';
import type {
  FeePreview,
  ServiceRequest,
  ServiceRequestFormData,
} from '../types/serviceRequest';
import ambassadorFeeStandardsImg from '../../assets/ambassador-fee-standards.png';
import { computeDurationHours } from '../lib/datetime';

const inputStyle = {
  borderColor: 'rgba(56, 44, 37, 0.15)',
  color: '#382C25',
  backgroundColor: 'white',
} as const;

const labelStyle = { color: '#382C25' } as const;
const hintStyle = { color: '#7A6E68' } as const;
const bodyTextStyle = { color: '#5A524C' } as const;
const sectionTitleClass = 'text-[15px] font-semibold tracking-tight';
const guideTitleClass = 'text-[13px] font-semibold leading-snug';
const guideBodyClass = 'text-[13px] leading-[1.75]';

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

function ReadOnlyField({
  label,
  value,
  fullWidth,
}: {
  label: string;
  value: ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <div className={fullWidth ? 'sm:col-span-2' : ''}>
      <p className="text-xs mb-1" style={hintStyle}>
        {label}
      </p>
      <div className="text-sm" style={labelStyle}>
        {value || '—'}
      </div>
    </div>
  );
}

function emptyForm(name: string): ServiceRequestFormData {
  return {
    initiatorName: name,
    department: '',
    costCenter: '',
    startAt: '',
    endAt: '',
    durationHours: '',
    language: 'zh',
    dayType: 'workday',
    visitorCount: '',
    ambassadorCount: '1',
    routeType: 'regular',
    routeDetail: '',
    visitGroup: '',
    visitReason: '普通参观',
    equipment: 'none',
    remarks: '',
  };
}

function toDatetimeLocal(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function durationHoursFromRange(startAt: string, endAt: string): string {
  const hours = computeDurationHours(startAt, endAt);
  return hours > 0 ? String(hours) : '';
}

function validateFormForSubmit(form: ServiceRequestFormData): string[] {
  const errors: string[] = [];
  if (!form.initiatorName.trim()) errors.push('请填写需求部门发起人');
  if (!form.department.trim()) errors.push('请选择需求部门');
  if (!form.startAt) errors.push('请选择讲解开始时间');
  if (!form.endAt) errors.push('请选择讲解结束时间');
  if (!form.visitGroup.trim()) errors.push('请填写参观团体');
  const visitors = Number(form.visitorCount);
  if (!form.visitorCount.trim() || !Number.isFinite(visitors) || visitors <= 0) {
    errors.push('请填写访客人数');
  }
  const ambassadors = Number(form.ambassadorCount);
  if (!form.ambassadorCount.trim() || !Number.isFinite(ambassadors) || ambassadors <= 0) {
    errors.push('请填写需要大使人数');
  }
  if (form.routeType === 'custom' && !form.routeDetail.trim()) {
    errors.push('请填写定制路线说明');
  }
  const hours = computeDurationHours(form.startAt, form.endAt);
  if (hours <= 0) {
    errors.push('讲解结束时间须晚于开始时间');
  }
  return errors;
}

function statusLabel(status: ServiceRequest['status'], returnNotice?: string | null) {
  if (status === 'draft' && returnNotice) return '已退回';
  switch (status) {
    case 'draft':
      return '草稿';
    case 'pending':
      return '待处理';
    case 'accepted':
      return '已接受';
    case 'completed':
      return '已完成';
    case 'cancelled':
      return '已取消';
    default:
      return status;
  }
}

type ServiceRequestsPage = 'new' | 'applications' | 'tasks' | 'report';

function pageHeader(
  page: ServiceRequestsPage,
  nav: ServiceNavigationSettings,
): {
  title: string;
  description: string;
  Icon: typeof ClipboardList;
} {
  switch (page) {
    case 'new':
      return {
        title: nav.newRequest.pageTitle,
        description: nav.newRequest.pageDescription,
        Icon: Send,
      };
    case 'applications':
      return {
        title: nav.applications.pageTitle,
        description: nav.applications.pageDescription,
        Icon: List,
      };
    case 'tasks':
      return {
        title: nav.tasks.pageTitle,
        description: nav.tasks.pageDescription,
        Icon: UserCheck,
      };
    case 'report':
      return {
        title: nav.report.pageTitle,
        description: nav.report.pageDescription,
        Icon: BarChart3,
      };
    default:
      return {
        title: nav.newRequest.pageTitle,
        description: nav.newRequest.pageDescription,
        Icon: ClipboardList,
      };
  }
}

export default function ServiceRequests() {
  const { currentUser } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const isWorkSection = location.pathname.startsWith('/ambassador-work');
  const [demandsTab, setDemandsTab] = useState<ServiceRequestsPage>('new');
  const [workTab, setWorkTab] = useState<ServiceRequestsPage>('tasks');
  const page: ServiceRequestsPage = isWorkSection
    ? workTab
    : demandsTab;
  const serviceNav = useNavigationCopy().service;
  const { description: pageDescription, Icon: PageIcon } = pageHeader(
    page,
    serviceNav,
  );
  const showAmbassadorTasks =
    currentUser.role === 'certified' || currentUser.role === 'admin';
  const [guideOpen, setGuideOpen] = useState(true);
  const [meta, setMeta] = useState<{
    regularRoute: string;
    departments: { id: string; name: string; costCenterHint: string }[];
    dayTypes: { id: string; label: string }[];
  } | null>(null);
  const [form, setForm] = useState<ServiceRequestFormData>(() =>
    emptyForm(currentUser.name),
  );
  const [fee, setFee] = useState<FeePreview | null>(null);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [listView, setListView] = useState<'list' | 'detail'>('list');
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const selectedRequest = useMemo(
    () => requests.find((r) => r.id === selectedRequestId) ?? null,
    [requests, selectedRequestId],
  );

  const returnedRequests = useMemo(
    () => requests.filter((r) => r.status === 'draft' && r.returnNotice),
    [requests],
  );

  const applicationsTabBadge = useMemo(
    () => requests.filter((r) => r.status === 'draft' && r.returnNotice).length,
    [requests],
  );

  const sectionTabs = isWorkSection
    ? [
        { id: 'tasks', label: serviceNav.tasks.menuLabel, icon: UserCheck },
        { id: 'report', label: serviceNav.report.menuLabel, icon: BarChart3 },
      ]
    : [
        { id: 'new', label: serviceNav.newRequest.menuLabel, icon: Send },
        {
          id: 'applications',
          label: serviceNav.applications.menuLabel,
          icon: List,
          badge:
            applicationsTabBadge > 0 ? applicationsTabBadge : undefined,
          badgeWarning: returnedRequests.length > 0,
        },
      ];

  const handleTabChange = (tabId: string) => {
    if (isWorkSection) {
      setWorkTab(tabId as ServiceRequestsPage);
    } else {
      setDemandsTab(tabId as ServiceRequestsPage);
    }
  };

  const loadMeta = useCallback(async () => {
    const m = await fetchServiceRequestMeta();
    setMeta(m);
  }, []);

  const loadList = useCallback(async () => {
    const list = await listServiceRequests();
    setRequests(list);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await loadMeta();
        await loadList();
      } catch (err) {
        setMessageIsError(true);
        setMessage(err instanceof Error ? err.message : '加载失败');
      } finally {
        setLoading(false);
      }
    })();
  }, [loadMeta, loadList]);

  useEffect(() => {
    if (!showAmbassadorTasks && isWorkSection) {
      navigate('/service-requests', { replace: true });
    }
  }, [showAmbassadorTasks, isWorkSection, navigate]);

  useEffect(() => {
    if (page === 'applications') {
      void (async () => {
        await loadList();
        notifyServiceRequestsUpdated();
      })();
      setListView('list');
      setSelectedRequestId(null);
    }
  }, [page, loadList]);

  useEffect(() => {
    if (!form.startAt || !form.endAt) return;
    const t = window.setTimeout(async () => {
      try {
        const durationHours = durationHoursFromRange(form.startAt, form.endAt);
        const preview = await previewServiceFee({ ...form, durationHours });
        setFee(preview);
      } catch {
        /* 草稿阶段可忽略 */
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [form.startAt, form.endAt, form.language, form.dayType, form.ambassadorCount]);

  const patch = (partial: Partial<ServiceRequestFormData>) => {
    setForm((prev) => ({ ...prev, ...partial }));
  };

  const patchVisitTimes = (partial: { startAt?: string; endAt?: string }) => {
    setForm((prev) => {
      const startAt = partial.startAt ?? prev.startAt;
      const endAt = partial.endAt ?? prev.endAt;
      return {
        ...prev,
        startAt,
        endAt,
        durationHours: durationHoursFromRange(startAt, endAt),
      };
    });
  };

  const plannedDurationDisplay = useMemo(() => {
    const hours = computeDurationHours(form.startAt, form.endAt);
    return hours > 0 ? `${hours} 小时` : '';
  }, [form.startAt, form.endAt]);

  const loadRequestIntoForm = (r: ServiceRequest) => {
    setForm({
      initiatorName: r.initiatorName,
      department: r.department,
      costCenter: r.costCenter,
      startAt: toDatetimeLocal(r.startAt),
      endAt: toDatetimeLocal(r.endAt),
      durationHours: (() => {
        const start = toDatetimeLocal(r.startAt);
        const end = toDatetimeLocal(r.endAt);
        const fromRange = durationHoursFromRange(start, end);
        if (fromRange) return fromRange;
        if (r.plannedDurationHours != null) return String(r.plannedDurationHours);
        if (r.durationHours != null) return String(r.durationHours);
        return '';
      })(),
      language: r.language,
      dayType: r.dayType,
      visitorCount: String(r.visitorCount || ''),
      ambassadorCount: String(r.ambassadorCount || '1'),
      routeType: r.routeType,
      routeDetail: r.routeDetail,
      visitGroup: r.visitGroup,
      visitReason: r.visitReason || '普通参观',
      equipment: r.equipment,
      remarks: r.remarks,
    });
    setEditingRequestId(r.id);
    setMessage('');
    setMessageIsError(false);
    setListView('list');
    setSelectedRequestId(null);
    setDemandsTab('new');
  };

  const openApplicationDetail = (r: ServiceRequest) => {
    setSelectedRequestId(r.id);
    setListView('detail');
  };

  const backToApplicationList = () => {
    setListView('list');
    setSelectedRequestId(null);
  };

  const handleCancelOrder = async () => {
    if (!selectedRequest) return;
    if (
      !window.confirm(
        `确认取消「${selectedRequest.visitGroup || '该需求'}」？取消后不可恢复。`,
      )
    ) {
      return;
    }
    setCancelling(true);
    try {
      await cancelServiceRequest(selectedRequest.id);
      await loadList();
      notifyServiceRequestsUpdated();
      backToApplicationList();
      setMessageIsError(false);
      setMessage('需求已取消');
      setDemandsTab('applications');
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '取消失败');
    } finally {
      setCancelling(false);
    }
  };

  const onDepartmentChange = (name: string) => {
    const dept = meta?.departments.find((d) => d.name === name);
    patch({
      department: name,
      costCenter: dept?.costCenterHint || form.costCenter,
    });
  };

  const onVisitorCountChange = (value: string) => {
    const n = Number(value);
    patch({
      visitorCount: value,
      ambassadorCount:
        n > 0 && n <= 30 && !form.ambassadorCount ? '1' : form.ambassadorCount,
    });
  };

  const handleSave = async (submit: boolean) => {
    if (submit) {
      const errors = validateFormForSubmit(form);
      if (errors.length > 0) {
        setMessageIsError(true);
        setMessage(errors.join('；'));
        return;
      }
    }
    setSaving(true);
    setMessage('');
    setMessageIsError(false);
    try {
      const payload = {
        ...form,
        startAt: form.startAt ? new Date(form.startAt).toISOString() : '',
        endAt: form.endAt ? new Date(form.endAt).toISOString() : '',
      };
      if (editingRequestId) {
        await updateServiceRequest(editingRequestId, payload, submit);
      } else {
        await createServiceRequest(payload, submit);
      }
      setForm(emptyForm(currentUser.name));
      setEditingRequestId(null);
      setFee(null);
      await loadList();
      notifyServiceRequestsUpdated();
      setDemandsTab('applications');
      setMessageIsError(false);
      setMessage(submit ? '需求已提交，等待 L&D 安排大使' : '草稿已保存');
    } catch (err) {
      setMessageIsError(true);
      setMessage(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[40vh]">
        <p className="text-sm" style={hintStyle}>
          加载中…
        </p>
      </div>
    );
  }

  const sectionTitle = isWorkSection
    ? serviceNav.workGroupLabel
    : serviceNav.demandsGroupLabel;

  const maxWidth =
    page === 'tasks' || page === 'report' ? 'max-w-7xl' : 'max-w-3xl';

  return (
    <SectionPageLayout
      title={sectionTitle}
      description={pageDescription}
      titleIcon={PageIcon}
      tabs={sectionTabs}
      activeTabId={page}
      onTabChange={handleTabChange}
      maxWidthClass={`${maxWidth} pb-24`}
    >
      {page === 'applications' && returnedRequests.length > 0 && (
        <div
          className="mb-4 px-4 py-3 rounded-lg text-sm border space-y-2"
          style={{
            borderColor: 'rgba(251, 191, 36, 0.45)',
            backgroundColor: 'rgba(251, 191, 36, 0.12)',
            color: '#92400E',
          }}
        >
          <p className="font-medium">您有 {returnedRequests.length} 条需求被管理员退回</p>
          {returnedRequests.map((r) => (
            <p key={r.id} className="text-xs leading-relaxed">
              <span className="font-medium">{r.visitGroup || '未命名团体'}：</span>
              {r.returnNotice}
            </p>
          ))}
        </div>
      )}

      {message && (
        <div
          className="mb-4 px-4 py-3 rounded-lg text-sm border"
          style={
            messageIsError
              ? {
                  borderColor: 'rgba(232, 93, 117, 0.35)',
                  backgroundColor: 'rgba(232, 93, 117, 0.08)',
                  color: '#E85D75',
                }
              : {
                  borderColor: 'rgba(94, 196, 182, 0.35)',
                  backgroundColor: 'rgba(94, 196, 182, 0.08)',
                  color: '#382C25',
                }
          }
        >
          {message}
        </div>
      )}

      {page === 'tasks' ? (
        <AmbassadorMyTasks />
      ) : page === 'report' ? (
        <AmbassadorMyReport />
      ) : page === 'applications' ? (
        listView === 'detail' && selectedRequest ? (
          <div className="space-y-5">
            <button
              type="button"
              onClick={backToApplicationList}
              className="flex items-center gap-1 text-sm"
              style={{ color: '#5EC4B6' }}
            >
              <ArrowLeft className="w-4 h-4" />
              {serviceNav.applications.backLinkLabel}
            </button>

            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-medium" style={labelStyle}>
                  {selectedRequest.visitGroup || '未命名团体'}
                </h2>
                <p className="text-sm mt-1" style={hintStyle}>
                  {selectedRequest.department} · {selectedRequest.initiatorName}
                </p>
              </div>
              <span
                className="text-xs px-2 py-0.5 rounded"
                style={{
                  backgroundColor:
                    selectedRequest.status === 'draft' && selectedRequest.returnNotice
                      ? 'rgba(251, 191, 36, 0.2)'
                      : 'rgba(94, 196, 182, 0.15)',
                  color:
                    selectedRequest.status === 'draft' && selectedRequest.returnNotice
                      ? '#B45309'
                      : '#5EC4B6',
                }}
              >
                {statusLabel(selectedRequest.status, selectedRequest.returnNotice)}
              </span>
            </div>

            {selectedRequest.returnNotice && (
              <div
                className="px-4 py-3 rounded-lg text-sm border leading-relaxed"
                style={{
                  borderColor: 'rgba(251, 191, 36, 0.45)',
                  backgroundColor: 'rgba(251, 191, 36, 0.12)',
                  color: '#92400E',
                }}
              >
                <p className="font-medium mb-1">管理员退回说明</p>
                <p className="text-xs">{selectedRequest.returnNotice}</p>
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
                <ReadOnlyField label="需求部门发起人" value={selectedRequest.initiatorName} />
                <ReadOnlyField label="需求部门" value={selectedRequest.department} />
                <ReadOnlyField label="成本中心" value={selectedRequest.costCenter} />
                <ReadOnlyField label="参观团体" value={selectedRequest.visitGroup} />
                <ReadOnlyField label="参观原因" value={selectedRequest.visitReason} />
                <ReadOnlyField label="访客人数" value={`${selectedRequest.visitorCount} 人`} />
                <ReadOnlyField
                  label="需要大使人数"
                  value={`${selectedRequest.ambassadorCount} 人`}
                />
                <ReadOnlyField
                  label="设备需求"
                  value={equipmentLabel(selectedRequest.equipment)}
                />
                <ReadOnlyField label="需求部门备注" value={selectedRequest.remarks} fullWidth />
              </div>
            </section>

            <section
              className="bg-white rounded-lg border px-6 py-5 space-y-4"
              style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
            >
              <h3 className={sectionTitleClass} style={labelStyle}>
                讲解安排
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ReadOnlyField label="讲解开始时间" value={toDatetimeLocal(selectedRequest.startAt).replace('T', ' ')} />
                <ReadOnlyField label="讲解结束时间" value={toDatetimeLocal(selectedRequest.endAt).replace('T', ' ')} />
                <ReadOnlyField
                  label="计划参观时长"
                  value={
                    selectedRequest.plannedDurationHours != null
                      ? `${selectedRequest.plannedDurationHours} 小时`
                      : '—'
                  }
                />
                <ReadOnlyField
                  label="实际参观时长"
                  value={
                    selectedRequest.actualDurationHours != null
                      ? `${selectedRequest.actualDurationHours} 小时`
                      : '—'
                  }
                />
                <ReadOnlyField label="讲解语言" value={languageLabel(selectedRequest.language)} />
                <ReadOnlyField label="日期类型" value={dayTypeLabel(selectedRequest.dayType)} />
                <ReadOnlyField label="预计收费" value={`¥ ${selectedRequest.estimatedFee}`} />
                <ReadOnlyField
                  label="已指定大使"
                  value={
                    selectedRequest.ambassadors?.length
                      ? selectedRequest.ambassadors.map((a) => a.name).join('、')
                      : '尚未派单'
                  }
                />
                <ReadOnlyField
                  label="参观路线"
                  value={selectedRequest.routeDetail}
                  fullWidth
                />
              </div>
            </section>

            {selectedRequest.status === 'draft' && selectedRequest.returnNotice && (
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => loadRequestIntoForm(selectedRequest)}
                  className="w-full py-3 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: '#5EC4B6' }}
                >
                  修改并重新提交
                </button>
                <button
                  type="button"
                  disabled={cancelling}
                  onClick={() => void handleCancelOrder()}
                  className="w-full py-3 rounded-lg text-sm font-medium border disabled:opacity-50"
                  style={{
                    borderColor: 'rgba(56, 44, 37, 0.15)',
                    color: '#7A6E68',
                    backgroundColor: 'white',
                  }}
                >
                  {cancelling ? '取消中…' : '取消订单'}
                </button>
              </div>
            )}
          </div>
        ) : (
        <div className="space-y-3">
          {requests.length === 0 ? (
            <div
              className="bg-white rounded-lg border p-10 text-center text-sm"
              style={{ borderColor: 'rgba(56, 44, 37, 0.06)', ...hintStyle }}
            >
              {serviceNav.applications.emptyListHint}
            </div>
          ) : (
            requests.map((r) => {
              const isReturned = r.status === 'draft' && Boolean(r.returnNotice);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => openApplicationDetail(r)}
                  className="w-full text-left bg-white rounded-lg border p-5 transition-colors hover:bg-[#FAFAFA] cursor-pointer"
                  style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-medium text-sm" style={{ color: '#382C25' }}>
                      {r.visitGroup || '未命名团体'}
                    </span>
                    <span
                      className="text-xs px-2 py-0.5 rounded"
                      style={{
                        backgroundColor: isReturned
                          ? 'rgba(251, 191, 36, 0.2)'
                          : 'rgba(94, 196, 182, 0.15)',
                        color: isReturned ? '#B45309' : '#5EC4B6',
                      }}
                    >
                      {statusLabel(r.status, r.returnNotice)}
                    </span>
                  </div>
                  {isReturned && r.returnNotice && (
                    <div
                      className="mb-3 px-3 py-2 rounded-lg text-xs leading-relaxed"
                      style={{
                        backgroundColor: 'rgba(251, 191, 36, 0.12)',
                        color: '#92400E',
                      }}
                    >
                      {r.returnNotice}
                    </div>
                  )}
                  <p className="text-xs mb-1" style={hintStyle}>
                    {r.department} · {r.initiatorName}
                  </p>
                  <p className="text-xs mb-1" style={hintStyle}>
                    {r.startAt ? toDatetimeLocal(r.startAt).replace('T', ' ') : '—'}
                    {' — '}
                    {r.endAt ? toDatetimeLocal(r.endAt).replace('T', ' ') : '—'}
                    {r.durationHours != null ? ` · ${r.durationHours} 小时` : ''}
                  </p>
                  <p className="text-xs" style={hintStyle}>
                    预计收费 ¥{r.estimatedFee} · {r.language === 'en' ? '英文' : '中文'}讲解
                  </p>
                  <p className="text-xs mt-3 flex items-center gap-1" style={{ color: '#5EC4B6' }}>
                    查看详情
                    <ChevronRight className="w-3.5 h-3.5" />
                  </p>
                </button>
              );
            })
          )}
        </div>
        )
      ) : (
        <form
          className="space-y-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave(true);
          }}
        >
          {editingRequestId && (
            <div
              className="px-4 py-3 rounded-lg text-sm border"
              style={{
                borderColor: 'rgba(251, 191, 36, 0.45)',
                backgroundColor: 'rgba(251, 191, 36, 0.12)',
                color: '#92400E',
              }}
            >
              正在修改被退回的需求，请根据管理员说明调整后重新提交。
            </div>
          )}
          {/* 申请须知 */}
          <CollapseCard
            title="申请须知"
            open={guideOpen}
            onToggle={() => setGuideOpen(!guideOpen)}
          >
            <div className="space-y-5">
              <GuideSection title="1. 审批与安排">
                需求部门提出需求后，需经 HR L&D 审批，并由 L&D 推荐讲解大使。
              </GuideSection>
              <GuideSection title="2. 讲解服务范围">
                仅包含园区，不含车间。大型会议讲解属额外定制化业务，将另行安排，同时大使参与其中将另行安排。
              </GuideSection>
              <GuideSection
                title="3. 大使安排"
                bullets={[
                  '各厂部均配有大使，原则上由各厂部安排自有大使完成讲解服务，各厂部自行依据情况判定是否为自有大使计算积分，若计算，部门需支付相应费用。',
                  '当厂部的自有大使不便提供讲解服务时，需求部门向 L&D 提出申请，由 L&D 根据排班情况安排大使。',
                ]}
              />
              <GuideSection
                title="4. 其它"
                bullets={[
                  '需求部门自行安排收尾人员。',
                  '需求部门自行向相关部门申请提前开启相应展厅的设备（灯光、空调联系能源管理部的 Tan Zi Yi；电视、窗帘联系公共服务的 Daisy Liu）。企微会同步发送消息。',
                  'L&D 仅有小蜜蜂可使用，若需蓝牙耳机，需求部门需自行外借。',
                ]}
              />
            </div>
          </CollapseCard>

          <section
            className="bg-white rounded-lg border px-6 py-5 space-y-4"
            style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
          >
            <h2 className={sectionTitleClass} style={labelStyle}>
              十如大使讲解收费标准（元/次/人）
            </h2>
            <img
              src={ambassadorFeeStandardsImg}
              alt="十如大使讲解收费标准"
              className="w-full h-auto block rounded-lg border"
              style={{ borderColor: 'rgba(56, 44, 37, 0.08)' }}
            />
          </section>

          {/* 基本信息 */}
          <section
            className="bg-white rounded-lg border px-6 py-5 space-y-5"
            style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
          >
            <h2 className={sectionTitleClass} style={labelStyle}>
              基本信息
            </h2>

            <Field label="需求部门发起人" required>
              <input
                className="w-full px-4 py-2.5 border rounded-lg text-sm outline-none"
                style={inputStyle}
                value={form.initiatorName}
                onChange={(e) => patch({ initiatorName: e.target.value })}
                placeholder="请填写内容"
              />
            </Field>

            <Field
              label="需求部门"
              required
              hint="请选择；若没有相应部门，请联系 L&D 增加"
            >
              <select
                className="w-full px-4 py-2.5 border rounded-lg text-sm outline-none"
                style={inputStyle}
                value={form.department}
                onChange={(e) => onDepartmentChange(e.target.value)}
              >
                <option value="">请选择部门</option>
                {meta?.departments.map((d) => (
                  <option key={d.id} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="需求部门成本中心">
              <input
                className="w-full px-4 py-2.5 border rounded-lg text-sm outline-none"
                style={inputStyle}
                value={form.costCenter}
                onChange={(e) => patch({ costCenter: e.target.value })}
                placeholder="如 3905632001"
              />
            </Field>

            <Field
              label="讲解开始日期时间"
              required
              hint="时长应包含大使就位及穿插活动等待时间"
            >
              <input
                type="datetime-local"
                className="w-full px-4 py-2.5 border rounded-lg text-sm outline-none"
                style={inputStyle}
                value={form.startAt}
                onChange={(e) => patchVisitTimes({ startAt: e.target.value })}
              />
            </Field>

            <Field label="讲解结束日期时间" required>
              <input
                type="datetime-local"
                className="w-full px-4 py-2.5 border rounded-lg text-sm outline-none"
                style={inputStyle}
                value={form.endAt}
                onChange={(e) => patchVisitTimes({ endAt: e.target.value })}
              />
            </Field>

            <Field label="预计参观时长（小时）" hint="根据起止时间自动计算">
              <p
                className="w-full px-4 py-2.5 border rounded-lg text-sm"
                style={{
                  borderColor: 'rgba(56, 44, 37, 0.15)',
                  color: plannedDurationDisplay ? '#382C25' : '#7A6E68',
                  backgroundColor: '#FAFAFA',
                }}
              >
                {plannedDurationDisplay || '请先选择开始与结束时间'}
              </p>
            </Field>

            <Field label="日期类型" required>
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                {meta?.dayTypes.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="dayType"
                      checked={form.dayType === d.id}
                      onChange={() =>
                        patch({ dayType: d.id as ServiceRequestFormData['dayType'] })
                      }
                    />
                    <span style={labelStyle}>{d.label}</span>
                  </label>
                ))}
              </div>
            </Field>

            <Field label="讲解语言" required>
              <div className="flex gap-6">
                {[
                  { id: 'zh' as const, label: '中文' },
                  { id: 'en' as const, label: '英文' },
                ].map((opt) => (
                  <label key={opt.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="language"
                      checked={form.language === opt.id}
                      onChange={() => patch({ language: opt.id })}
                    />
                    <span style={labelStyle}>{opt.label}</span>
                  </label>
                ))}
              </div>
            </Field>
          </section>

          {/* 参观信息 */}
          <section
            className="bg-white rounded-lg border px-6 py-5 space-y-5"
            style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
          >
            <h2 className={sectionTitleClass} style={labelStyle}>
              参观信息
            </h2>

            <Field label="访客人数" required hint="大致人数即可">
              <input
                type="number"
                min="1"
                className="w-full px-4 py-2.5 border rounded-lg text-sm outline-none"
                style={inputStyle}
                value={form.visitorCount}
                onChange={(e) => onVisitorCountChange(e.target.value)}
                placeholder="请填写数字"
              />
            </Field>

            <Field
              label="需要大使人数"
              required
              hint="访客在 30 人以内默认仅配备 1 名大使"
            >
              <input
                type="number"
                min="1"
                className="w-full px-4 py-2.5 border rounded-lg text-sm outline-none"
                style={inputStyle}
                value={form.ambassadorCount}
                onChange={(e) => patch({ ambassadorCount: e.target.value })}
              />
            </Field>

            <Field label="预计收费" hint="费用仅包含讲解服务，不含茶水等；根据时长与语言自动计算">
              <div
                className="px-4 py-3 rounded-lg text-sm font-medium"
                style={{ backgroundColor: '#F5F5F5', color: '#382C25' }}
              >
                {fee ? `¥ ${fee.totalFee}（${fee.ratePerPerson} 元/人 × ${fee.ambassadorCount} 人）` : '填写时间与人数后自动计算'}
              </div>
            </Field>

            <Field label="参观路线选择" required>
              <div className="space-y-3">
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="routeType"
                    className="mt-1"
                    checked={form.routeType === 'regular'}
                    onChange={() =>
                      patch({
                        routeType: 'regular',
                        routeDetail: meta?.regularRoute || '',
                      })
                    }
                  />
                  <span style={labelStyle}>
                    <span className="font-medium">常规线</span>
                    <span className="block text-xs mt-1" style={hintStyle}>
                      {meta?.regularRoute}
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="routeType"
                    className="mt-1"
                    checked={form.routeType === 'custom'}
                    onChange={() => patch({ routeType: 'custom', routeDetail: '' })}
                  />
                  <span className="font-medium" style={labelStyle}>
                    定制线
                  </span>
                </label>
                {form.routeType === 'custom' && (
                  <textarea
                    className="w-full px-4 py-2.5 border rounded-lg text-sm outline-none resize-y"
                    style={inputStyle}
                    rows={3}
                    value={form.routeDetail}
                    onChange={(e) => patch({ routeDetail: e.target.value })}
                    placeholder="请描述定制参观路线"
                  />
                )}
              </div>
            </Field>

            <Field
              label="参观团体"
              required
              hint="为便于后勤部门区别，请填写团体具体名称"
            >
              <input
                className="w-full px-4 py-2.5 border rounded-lg text-sm outline-none"
                style={inputStyle}
                value={form.visitGroup}
                onChange={(e) => patch({ visitGroup: e.target.value })}
              />
            </Field>

            <Field label="参观原因（选填）">
              <div className="flex flex-wrap gap-4">
                {['普通参观', '研学', '其它'].map((reason) => (
                  <label key={reason} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="visitReason"
                      checked={form.visitReason === reason}
                      onChange={() => patch({ visitReason: reason })}
                    />
                    <span style={labelStyle}>{reason}</span>
                  </label>
                ))}
              </div>
            </Field>

            <Field label="参观设备需求" required hint="需求部门自行借用">
              <div className="space-y-2">
                {[
                  { id: 'bee' as const, label: '小蜜蜂（L&D，库存4）' },
                  { id: 'bluetooth' as const, label: '蓝牙耳机（GIB，库存30）' },
                  { id: 'none' as const, label: '无需设备' },
                ].map((opt) => (
                  <label key={opt.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="equipment"
                      checked={form.equipment === opt.id}
                      onChange={() => patch({ equipment: opt.id })}
                    />
                    <span style={labelStyle}>{opt.label}</span>
                  </label>
                ))}
              </div>
            </Field>

            <Field
              label="需求部门备注"
              hint="如需指定大使，请填写大使姓名"
            >
              <textarea
                className="w-full px-4 py-2.5 border rounded-lg text-sm outline-none resize-y"
                style={inputStyle}
                rows={3}
                value={form.remarks}
                onChange={(e) => patch({ remarks: e.target.value })}
                placeholder="选填"
              />
            </Field>
          </section>

          <div className="flex gap-3 sticky bottom-0 z-20 py-4 bg-[#FAFAFA] border-t shadow-[0_-4px_12px_rgba(56,44,37,0.06)]" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave(false)}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-lg border text-sm transition-all disabled:opacity-50"
              style={{
                borderColor: 'rgba(56, 44, 37, 0.15)',
                color: '#7A6E68',
                backgroundColor: 'white',
              }}
            >
              <Save className="w-4 h-4" />
              保存草稿
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave(true)}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50"
              style={{ backgroundColor: '#5EC4B6' }}
            >
              <Send className="w-4 h-4" />
              {saving ? '提交中…' : '提交需求'}
            </button>
          </div>
        </form>
      )}
    </SectionPageLayout>
  );
}

function CollapseCard({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section
      className="bg-white rounded-lg border overflow-hidden"
      style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
    >
      <button
        type="button"
        className="w-full flex items-center justify-between px-6 py-4 text-left"
        onClick={onToggle}
      >
        <span className="text-[15px] font-semibold tracking-tight" style={labelStyle}>
          {title}
        </span>
        {open ? (
          <ChevronUp className="w-4 h-4 shrink-0" style={hintStyle} />
        ) : (
          <ChevronDown className="w-4 h-4 shrink-0" style={hintStyle} />
        )}
      </button>
      {open && (
        <div
          className="px-6 pb-6 pt-1 border-t"
          style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
        >
          {children}
        </div>
      )}
    </section>
  );
}

function GuideSection({
  title,
  children,
  bullets,
}: {
  title: string;
  children?: ReactNode;
  bullets?: string[];
}) {
  return (
    <div className="space-y-2">
      <h3 className={guideTitleClass} style={labelStyle}>
        {title}
      </h3>
      {bullets ? (
        <ul
          className={`${guideBodyClass} list-disc pl-[1.25rem] space-y-2.5 marker:text-[#5EC4B6]`}
          style={bodyTextStyle}
        >
          {bullets.map((item) => (
            <li key={item.slice(0, 24)}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className={guideBodyClass} style={bodyTextStyle}>
          {children}
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className={`block ${guideTitleClass}`} style={labelStyle}>
        {required && <span style={{ color: '#e57373' }}>* </span>}
        {label}
      </label>
      {hint && (
        <p className="text-xs leading-[1.6] -mt-0.5" style={hintStyle}>
          {hint}
        </p>
      )}
      {children}
    </div>
  );
}
