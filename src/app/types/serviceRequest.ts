export type ServiceRequestStatus =
  | 'draft'
  | 'pending'
  | 'accepted'
  | 'completed'
  | 'cancelled';

export type ServiceLanguage = 'zh' | 'en';
export type ServiceDayType = 'workday' | 'holiday' | 'weekend';
export type ServiceRouteType = 'regular' | 'custom';
export type ServiceEquipment = 'bee' | 'bluetooth' | 'none';

export interface DepartmentOption {
  id: string;
  name: string;
  costCenterHint: string;
}

export interface ServiceRequestFormData {
  initiatorName: string;
  department: string;
  costCenter: string;
  startAt: string;
  endAt: string;
  durationHours: string;
  language: ServiceLanguage;
  dayType: ServiceDayType;
  visitorCount: string;
  ambassadorCount: string;
  routeType: ServiceRouteType;
  routeDetail: string;
  visitGroup: string;
  visitReason: string;
  equipment: ServiceEquipment;
  remarks: string;
}

export interface ServiceAmbassadorRef {
  id: string;
  name: string;
}

export interface AmbassadorServiceStat {
  id: string;
  name: string;
  role: string;
  serviceCount: number;
  totalHours: number;
  totalPoints: number;
  pendingManualCount: number;
}

export interface AmbassadorStatsResponse {
  totalVisitCount: number;
  totalPointsAll: number;
  ambassadors: AmbassadorServiceStat[];
}

export interface AmbassadorMyReportSummary {
  totalPoints: number;
  totalHours: number;
  completedCount: number;
  pendingCount: number;
  pendingManualCount: number;
  totalAssigned: number;
}

export interface AmbassadorMyReportResponse {
  summary: AmbassadorMyReportSummary;
  records: ServiceRequest[];
}

export interface ServiceRequest {
  id: string;
  status: ServiceRequestStatus;
  initiatorName: string;
  department: string;
  costCenter: string;
  startAt: string;
  endAt: string;
  /** 计划时长（需求单填写） */
  plannedDurationHours?: number | null;
  /** 实际参观时长（大使参观结束后填报） */
  actualDurationHours?: number | null;
  durationHours: number | null;
  actualDurationReportedAt?: string | null;
  actualDurationReportedBy?: string | null;
  language: ServiceLanguage;
  dayType: ServiceDayType;
  visitorCount: number;
  ambassadorCount: number;
  estimatedFee: number;
  routeType: ServiceRouteType;
  routeDetail: string;
  visitGroup: string;
  visitReason: string;
  equipment: ServiceEquipment;
  remarks: string;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  /** 管理员退回时告知发起人的说明 */
  returnNotice?: string | null;
  returnedAt?: string | null;
  servicePoints?: number | null;
  pointsManualRequired?: boolean;
  manualPoints?: number | null;
  ambassadors?: ServiceAmbassadorRef[];
  supervisorRecipients?: ServiceAmbassadorRef[];
}

export interface FeePreview {
  durationHours: number;
  ratePerPerson: number;
  ambassadorCount: number;
  totalFee: number;
  dayType: ServiceDayType;
  language: ServiceLanguage;
}
