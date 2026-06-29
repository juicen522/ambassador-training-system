import { DEFAULT_NAVIGATION, type NavigationSettings } from '../types/settings';

/** 将磁盘/接口中的 navigation 与默认值深度合并，避免缺字段 */
export function mergeNavigation(
  partial?: Partial<NavigationSettings> | null,
): NavigationSettings {
  const nav = partial ?? {};
  return {
    ...DEFAULT_NAVIGATION,
    ...nav,
    dashboard: { ...DEFAULT_NAVIGATION.dashboard, ...nav.dashboard },
    materials: { ...DEFAULT_NAVIGATION.materials, ...nav.materials },
    training: {
      ...DEFAULT_NAVIGATION.training,
      ...nav.training,
      overview: {
        ...DEFAULT_NAVIGATION.training.overview,
        ...nav.training?.overview,
      },
      basic: {
        ...DEFAULT_NAVIGATION.training.basic,
        ...nav.training?.basic,
      },
      advanced: {
        ...DEFAULT_NAVIGATION.training.advanced,
        ...nav.training?.advanced,
      },
    },
    admin: {
      ...DEFAULT_NAVIGATION.admin,
      ...nav.admin,
      tabs: {
        ...DEFAULT_NAVIGATION.admin.tabs,
        ...nav.admin?.tabs,
      },
    },
    approvalFlow: { ...DEFAULT_NAVIGATION.approvalFlow, ...nav.approvalFlow },
    ambassadorServices: {
      ...DEFAULT_NAVIGATION.ambassadorServices,
      ...nav.ambassadorServices,
      requests: {
        ...DEFAULT_NAVIGATION.ambassadorServices.requests,
        ...nav.ambassadorServices?.requests,
      },
      visits: {
        ...DEFAULT_NAVIGATION.ambassadorServices.visits,
        ...nav.ambassadorServices?.visits,
      },
    },
    service: {
      ...DEFAULT_NAVIGATION.service,
      ...nav.service,
      newRequest: {
        ...DEFAULT_NAVIGATION.service.newRequest,
        ...nav.service?.newRequest,
      },
      applications: {
        ...DEFAULT_NAVIGATION.service.applications,
        ...nav.service?.applications,
      },
      tasks: {
        ...DEFAULT_NAVIGATION.service.tasks,
        ...nav.service?.tasks,
      },
      report: {
        ...DEFAULT_NAVIGATION.service.report,
        ...nav.service?.report,
      },
    },
  };
}
