import { apiFetch } from './api';
import type {
  AmbassadorMyReportResponse,
  AmbassadorServiceStat,
  AmbassadorStatsResponse,
  DepartmentOption,
  FeePreview,
  ServiceRequest,
  ServiceRequestFormData,
} from '../types/serviceRequest';

function normalizeRequest(raw: Record<string, unknown>): ServiceRequest {
  return {
    id: String(raw.id),
    status: raw.status as ServiceRequest['status'],
    initiatorName: String(raw.initiatorName ?? ''),
    department: String(raw.department ?? ''),
    costCenter: String(raw.costCenter ?? ''),
    startAt: String(raw.startAt ?? ''),
    endAt: String(raw.endAt ?? ''),
    plannedDurationHours:
      raw.plannedDurationHours != null
        ? Number(raw.plannedDurationHours)
        : raw.durationHours != null
          ? Number(raw.durationHours)
          : null,
    actualDurationHours:
      raw.actualDurationHours != null ? Number(raw.actualDurationHours) : null,
    durationHours:
      raw.actualDurationHours != null
        ? Number(raw.actualDurationHours)
        : raw.durationHours != null
          ? Number(raw.durationHours)
          : null,
    actualDurationReportedAt:
      raw.actualDurationReportedAt != null
        ? String(raw.actualDurationReportedAt)
        : null,
    actualDurationReportedBy:
      raw.actualDurationReportedBy != null
        ? String(raw.actualDurationReportedBy)
        : null,
    language: (raw.language as ServiceRequest['language']) || 'zh',
    dayType:
      raw.dayType === 'festival'
        ? 'weekend'
        : (raw.dayType as ServiceRequest['dayType']) || 'workday',
    visitorCount: Number(raw.visitorCount) || 0,
    ambassadorCount: Number(raw.ambassadorCount) || 1,
    estimatedFee: Number(raw.estimatedFee) || 0,
    routeType: (raw.routeType as ServiceRequest['routeType']) || 'regular',
    routeDetail: String(raw.routeDetail ?? ''),
    visitGroup: String(raw.visitGroup ?? ''),
    visitReason: String(raw.visitReason ?? ''),
    equipment: (raw.equipment as ServiceRequest['equipment']) || 'none',
    remarks: String(raw.remarks ?? ''),
    createdBy: raw.createdBy != null ? String(raw.createdBy) : null,
    createdByName:
      raw.createdByName != null ? String(raw.createdByName) : null,
    createdAt: String(raw.createdAt ?? ''),
    updatedAt: String(raw.updatedAt ?? ''),
    submittedAt: raw.submittedAt != null ? String(raw.submittedAt) : null,
    returnNotice: raw.returnNotice != null ? String(raw.returnNotice) : null,
    returnedAt: raw.returnedAt != null ? String(raw.returnedAt) : null,
    manualPoints:
      raw.manualPoints != null ? Number(raw.manualPoints) : null,
    pointsManualRequired: Boolean(raw.pointsManualRequired),
    servicePoints:
      raw.manualPoints != null
        ? Number(raw.manualPoints)
        : raw.servicePoints != null
          ? Number(raw.servicePoints)
          : null,
    ambassadors: Array.isArray(raw.ambassadors)
      ? (raw.ambassadors as { id: string; name: string }[]).map((a) => ({
          id: String(a.id),
          name: String(a.name),
        }))
      : [],
    supervisorRecipients: Array.isArray(raw.supervisorRecipients)
      ? (raw.supervisorRecipients as { id: string; name: string }[]).map((a) => ({
          id: String(a.id),
          name: String(a.name),
        }))
      : [],
  };
}

export type AdminServiceListParams = {
  q?: string;
  status?: string;
  department?: string;
  ambassadorId?: string;
};

export async function fetchAdminAmbassadorStats(): Promise<AmbassadorStatsResponse> {
  const data = await apiFetch('/service-requests/admin/ambassador-stats');
  return {
    totalVisitCount: Number(data.totalVisitCount) || 0,
    totalPointsAll: Number(data.totalPointsAll) || 0,
    ambassadors: ((data.ambassadors as AmbassadorServiceStat[]) ?? []).map((a) => ({
      ...a,
      totalPoints: Number(a.totalPoints) || 0,
      pendingManualCount: Number(a.pendingManualCount) || 0,
    })),
  };
}

export function computeAdminPendingBadge(requests: ServiceRequest[]): {
  pendingRequests: number;
  pendingManualPoints: number;
} {
  let pendingRequests = 0;
  let pendingManualPoints = 0;
  for (const r of requests) {
    if (r.status === 'pending') pendingRequests += 1;
    if (r.pointsManualRequired && r.manualPoints == null) pendingManualPoints += 1;
  }
  return { pendingRequests, pendingManualPoints };
}

export async function fetchAdminServiceList(
  params: AdminServiceListParams = {},
): Promise<{
  requests: ServiceRequest[];
  departments: string[];
  totalCompletedCount: number;
  pendingRequests?: number;
  pendingManualPoints?: number;
}> {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.status) search.set('status', params.status);
  if (params.department) search.set('department', params.department);
  if (params.ambassadorId) search.set('ambassadorId', params.ambassadorId);
  const qs = search.toString();
  const data = await apiFetch(`/service-requests/admin/list${qs ? `?${qs}` : ''}`);
  const requests = (data.requests as Record<string, unknown>[]).map(normalizeRequest);
  const pendingRequests =
    data.pendingRequests != null ? Number(data.pendingRequests) : undefined;
  const pendingManualPoints =
    data.pendingManualPoints != null ? Number(data.pendingManualPoints) : undefined;
  return {
    requests,
    departments: (data.departments as string[]) ?? [],
    totalCompletedCount: Number(data.totalCompletedCount) || 0,
    pendingRequests:
      pendingRequests != null && !Number.isNaN(pendingRequests)
        ? pendingRequests
        : undefined,
    pendingManualPoints:
      pendingManualPoints != null && !Number.isNaN(pendingManualPoints)
        ? pendingManualPoints
        : undefined,
  };
}

export async function returnServiceRequestToCreator(
  id: string,
  reason?: string,
): Promise<{ request: ServiceRequest; notice: { message: string; returnedAt: string } }> {
  const data = await apiFetch(`/service-requests/${id}/return-to-creator`, {
    method: 'PATCH',
    body: JSON.stringify({ reason: reason?.trim() || undefined }),
  });
  const result = {
    request: normalizeRequest(data.request as Record<string, unknown>),
    notice: data.notice as { message: string; returnedAt: string },
  };
  notifyServiceRequestsUpdated();
  return result;
}

export async function updateServiceRequestAdmin(
  id: string,
  payload: {
    status?: string;
    ambassadorIds?: string[];
    manualPoints?: number | null;
  },
): Promise<ServiceRequest> {
  const data = await apiFetch(`/service-requests/${id}/admin`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  const request = normalizeRequest(data.request as Record<string, unknown>);
  notifyServiceRequestsUpdated();
  return request;
}

export async function fetchServiceRequestMeta(): Promise<{
  regularRoute: string;
  departments: DepartmentOption[];
  dayTypes: { id: string; label: string }[];
}> {
  const data = await apiFetch('/service-requests/meta');
  return {
    regularRoute: String(data.regularRoute),
    departments: (data.departments as Record<string, unknown>[]).map((d) => ({
      id: String(d.id),
      name: String(d.name),
      costCenterHint: String(d.cost_center_hint ?? d.costCenterHint ?? ''),
    })),
    dayTypes: data.dayTypes as { id: string; label: string }[],
  };
}

export async function previewServiceFee(
  payload: Partial<ServiceRequestFormData>,
): Promise<FeePreview> {
  const data = await apiFetch('/service-requests/calculate-fee', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data as FeePreview;
}

export async function listServiceRequests(): Promise<ServiceRequest[]> {
  const data = await apiFetch('/service-requests');
  return (data.requests as Record<string, unknown>[]).map(normalizeRequest);
}

export async function fetchAdminPendingBadge(): Promise<{
  pendingRequests: number;
  pendingManualPoints: number;
}> {
  try {
    const data = await apiFetch('/service-requests/admin/pending-badge');
    return {
      pendingRequests: Number(data.pendingRequests) || 0,
      pendingManualPoints: Number(data.pendingManualPoints) || 0,
    };
  } catch {
    const list = await fetchAdminServiceList();
    if (
      list.pendingRequests != null &&
      list.pendingManualPoints != null
    ) {
      return {
        pendingRequests: list.pendingRequests,
        pendingManualPoints: list.pendingManualPoints,
      };
    }
    return computeAdminPendingBadge(list.requests);
  }
}

export async function fetchApplicationsBadge(): Promise<{
  returned: number;
  pending: number;
}> {
  const data = await apiFetch('/service-requests/returned-count');
  return {
    returned: Number(data.count) || 0,
    pending: Number(data.pending) || 0,
  };
}

/** @deprecated use fetchApplicationsBadge */
export async function fetchReturnedRequestCount(): Promise<number> {
  const { returned } = await fetchApplicationsBadge();
  return returned;
}

export async function cancelServiceRequest(id: string): Promise<ServiceRequest> {
  const data = await apiFetch(`/service-requests/${id}/cancel`, {
    method: 'PATCH',
  });
  return normalizeRequest(data.request as Record<string, unknown>);
}

export function notifyServiceRequestsUpdated() {
  window.dispatchEvent(new CustomEvent('service-requests-updated'));
}

export async function fetchMyAssignedServiceRequests(): Promise<ServiceRequest[]> {
  const data = await apiFetch('/service-requests/assignments/mine');
  return (data.requests as Record<string, unknown>[]).map(normalizeRequest);
}

export async function fetchMyAmbassadorReport(): Promise<AmbassadorMyReportResponse> {
  const data = await apiFetch('/service-requests/assignments/mine/report');
  return {
    summary: {
      totalPoints: Number(data.summary?.totalPoints) || 0,
      totalHours: Number(data.summary?.totalHours) || 0,
      completedCount: Number(data.summary?.completedCount) || 0,
      pendingCount: Number(data.summary?.pendingCount) || 0,
      pendingManualCount: Number(data.summary?.pendingManualCount) || 0,
      totalAssigned: Number(data.summary?.totalAssigned) || 0,
    },
    records: ((data.records as Record<string, unknown>[]) ?? []).map(normalizeRequest),
  };
}

export async function reportServiceVisitDuration(
  id: string,
  actualDurationHours: number,
): Promise<ServiceRequest> {
  const data = await apiFetch(`/service-requests/${id}/report-visit`, {
    method: 'PATCH',
    body: JSON.stringify({ actualDurationHours }),
  });
  return normalizeRequest(data.request as Record<string, unknown>);
}

export async function rejectServiceAssignment(
  id: string,
  reason?: string,
): Promise<ServiceRequest> {
  const data = await apiFetch(`/service-requests/${id}/reject-assignment`, {
    method: 'PATCH',
    body: JSON.stringify({ reason: reason?.trim() || undefined }),
  });
  return normalizeRequest(data.request as Record<string, unknown>);
}

export async function createServiceRequest(
  payload: ServiceRequestFormData,
  submit: boolean,
): Promise<ServiceRequest> {
  const data = await apiFetch('/service-requests', {
    method: 'POST',
    body: JSON.stringify({ ...payload, submit }),
  });
  return normalizeRequest(data.request as Record<string, unknown>);
}

export async function updateServiceRequest(
  id: string,
  payload: ServiceRequestFormData,
  submit: boolean,
): Promise<ServiceRequest> {
  const data = await apiFetch(`/service-requests/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ ...payload, submit }),
  });
  return normalizeRequest(data.request as Record<string, unknown>);
}
