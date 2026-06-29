import { useMemo, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import type {
  NavCopy,
  NavigationSettings,
  ServiceApplicationsLabels,
  ServiceNavigationSettings,
} from '../types/settings';

const inputStyle = {
  borderColor: 'rgba(56, 44, 37, 0.15)',
  color: '#382C25',
};

type SidebarTabId =
  | 'dashboard'
  | 'materials'
  | 'service-demands'
  | 'service-work'
  | 'training'
  | 'admin'
  | 'ambassador-services';

function NavTextField({
  label,
  hint,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm mb-2" style={{ color: '#382C25' }}>
        {label}
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="w-full px-4 py-2.5 border rounded-lg text-sm resize-y"
          style={inputStyle}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-4 py-2.5 border rounded-lg text-sm"
          style={inputStyle}
        />
      )}
      {hint && (
        <p className="text-xs mt-1" style={{ color: '#7A6E68' }}>
          {hint}
        </p>
      )}
    </div>
  );
}

function NavBlock({
  heading,
  copy,
  onChange,
  showMenu = true,
  extras,
}: {
  heading: string;
  copy: NavCopy;
  onChange: (patch: Partial<NavCopy & ServiceApplicationsLabels>) => void;
  showMenu?: boolean;
  extras?: { label: string; key: string; value: string; multiline?: boolean }[];
}) {
  return (
    <div
      className="pt-4 mt-4 border-t space-y-4 first:pt-0 first:mt-0 first:border-0"
      style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
    >
      <h4 className="text-sm font-medium" style={{ color: '#382C25' }}>
        {heading}
      </h4>
      {showMenu && (
        <NavTextField
          label="侧边栏菜单名"
          value={copy.menuLabel}
          onChange={(v) => onChange({ menuLabel: v })}
        />
      )}
      <NavTextField
        label="页面标题"
        value={copy.pageTitle}
        onChange={(v) => onChange({ pageTitle: v })}
      />
      <NavTextField
        label="页面说明"
        value={copy.pageDescription}
        onChange={(v) => onChange({ pageDescription: v })}
        multiline
      />
      {extras?.map((field) => (
        <NavTextField
          key={field.key}
          label={field.label}
          value={field.value}
          onChange={(v) => onChange({ [field.key]: v } as Partial<NavCopy & ServiceApplicationsLabels>)}
          multiline={field.multiline}
        />
      ))}
    </div>
  );
}

export type NavigationChangeHandler = (
  updater: (prev: NavigationSettings) => NavigationSettings,
) => void;

export default function NavigationCopyEditor({
  navigation,
  onChange,
}: {
  navigation: NavigationSettings;
  onChange: NavigationChangeHandler;
}) {
  const service = navigation.service;
  const applications = service.applications as ServiceApplicationsLabels;

  const sidebarTabs = useMemo(
    () =>
      [
        { id: 'dashboard' as const, label: navigation.dashboard.menuLabel },
        { id: 'materials' as const, label: navigation.materials.menuLabel },
        { id: 'service-demands' as const, label: service.demandsGroupLabel },
        { id: 'service-work' as const, label: service.workGroupLabel },
        { id: 'training' as const, label: navigation.training.menuLabel },
        { id: 'admin' as const, label: navigation.admin.menuLabel },
        { id: 'ambassador-services' as const, label: navigation.ambassadorServices.menuLabel },
      ] satisfies { id: SidebarTabId; label: string }[],
    [navigation, service.demandsGroupLabel, service.workGroupLabel],
  );

  const [tab, setTab] = useState<SidebarTabId>('dashboard');

  const patchService = (partial: Partial<ServiceNavigationSettings>) => {
    onChange((prev) => ({
      ...prev,
      service: { ...prev.service, ...partial },
    }));
  };

  const patchServicePage = <
    K extends 'newRequest' | 'applications' | 'tasks' | 'report',
  >(
    key: K,
    pagePatch: Partial<ServiceNavigationSettings[K]>,
  ) => {
    onChange((prev) => ({
      ...prev,
      service: {
        ...prev.service,
        [key]: { ...prev.service[key], ...pagePatch },
      },
    }));
  };

  return (
    <div
      className="bg-white rounded-lg border p-6 mb-6"
      style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
    >
      <div className="flex items-start gap-3 mb-5">
        <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(94, 196, 182, 0.1)' }}>
          <ClipboardList className="w-5 h-5" style={{ color: '#5EC4B6' }} />
        </div>
        <div>
          <h3 className="text-base font-medium" style={{ color: '#382C25' }}>
            全站导航与页面文案
          </h3>
          <p className="text-xs mt-1" style={{ color: '#7A6E68' }}>
            分类与左侧菜单栏一致；修改侧边栏、页面标题与说明后保存即可生效
          </p>
        </div>
      </div>

      <div
        className="flex flex-wrap gap-1 mb-6 border-b pb-1"
        style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
      >
        {sidebarTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="px-3 py-2 text-sm font-medium rounded-t-lg transition-colors"
            style={{
              color: tab === t.id ? '#5EC4B6' : '#7A6E68',
              borderBottom: tab === t.id ? '2px solid #5EC4B6' : '2px solid transparent',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && (
        <NavBlock
          heading={navigation.dashboard.menuLabel}
          copy={navigation.dashboard}
          onChange={(p) =>
            onChange((prev) => ({
              ...prev,
              dashboard: { ...prev.dashboard, ...p },
            }))
          }
        />
      )}

      {tab === 'materials' && (
        <NavBlock
          heading={navigation.materials.menuLabel}
          copy={navigation.materials}
          onChange={(p) =>
            onChange((prev) => ({
              ...prev,
              materials: { ...prev.materials, ...p },
            }))
          }
        />
      )}

      {tab === 'service-demands' && (
        <div>
          <NavTextField
            label="侧边栏分组名"
            value={service.demandsGroupLabel}
            onChange={(v) => patchService({ demandsGroupLabel: v })}
          />
          <NavBlock
            heading={service.newRequest.menuLabel}
            copy={service.newRequest}
            onChange={(p) => patchServicePage('newRequest', p)}
          />
          <NavBlock
            heading={service.applications.menuLabel}
            copy={service.applications}
            onChange={(p) => patchServicePage('applications', p)}
            extras={[
              {
                key: 'backLinkLabel',
                label: '详情页返回链接',
                value: applications.backLinkLabel,
              },
              {
                key: 'emptyListHint',
                label: '列表为空提示',
                value: applications.emptyListHint,
                multiline: true,
              },
            ]}
          />
        </div>
      )}

      {tab === 'service-work' && (
        <div>
          <NavTextField
            label="侧边栏分组名"
            value={service.workGroupLabel}
            onChange={(v) => patchService({ workGroupLabel: v })}
          />
          <NavBlock
            heading={service.tasks.menuLabel}
            copy={service.tasks}
            onChange={(p) => patchServicePage('tasks', p)}
          />
          <NavBlock
            heading={service.report.menuLabel}
            copy={service.report}
            onChange={(p) => patchServicePage('report', p)}
          />
        </div>
      )}

      {tab === 'training' && (
        <div>
          <NavTextField
            label="侧边栏分组名"
            value={navigation.training.menuLabel}
            onChange={(v) =>
              onChange((prev) => ({
                ...prev,
                training: { ...prev.training, menuLabel: v },
              }))
            }
          />
          <NavBlock
            heading="学习进度（点击「培训中心」进入）"
            copy={navigation.training.overview}
            showMenu={false}
            onChange={(p) =>
              onChange((prev) => ({
                ...prev,
                training: {
                  ...prev.training,
                  overview: { ...prev.training.overview, ...p },
                },
              }))
            }
          />
          <NavBlock
            heading={navigation.training.basic.menuLabel}
            copy={navigation.training.basic}
            onChange={(p) =>
              onChange((prev) => ({
                ...prev,
                training: {
                  ...prev.training,
                  basic: { ...prev.training.basic, ...p },
                },
              }))
            }
          />
          <NavBlock
            heading={navigation.training.advanced.menuLabel}
            copy={navigation.training.advanced}
            onChange={(p) =>
              onChange((prev) => ({
                ...prev,
                training: {
                  ...prev.training,
                  advanced: { ...prev.training.advanced, ...p },
                },
              }))
            }
          />
        </div>
      )}

      {tab === 'admin' && (
        <div>
          <NavBlock
            heading={navigation.admin.menuLabel}
            copy={{
              menuLabel: navigation.admin.menuLabel,
              pageTitle: navigation.admin.pageTitle,
              pageDescription: navigation.admin.pageDescription,
            }}
            onChange={(p) =>
              onChange((prev) => ({
                ...prev,
                admin: { ...prev.admin, ...p },
              }))
            }
          />
          <div
            className="pt-4 mt-4 border-t space-y-4"
            style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
          >
            <h4 className="text-sm font-medium" style={{ color: '#382C25' }}>
              培训管理 · 页内标签
            </h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <NavTextField
                label="大使管理"
                value={navigation.admin.tabs.users}
                onChange={(v) =>
                  onChange((prev) => ({
                    ...prev,
                    admin: {
                      ...prev.admin,
                      tabs: { ...prev.admin.tabs, users: v },
                    },
                  }))
                }
              />
              <NavTextField
                label="知识库管理"
                value={navigation.admin.tabs.materials}
                onChange={(v) =>
                  onChange((prev) => ({
                    ...prev,
                    admin: {
                      ...prev.admin,
                      tabs: { ...prev.admin.tabs, materials: v },
                    },
                  }))
                }
              />
              <NavTextField
                label="培训内容管理"
                value={navigation.admin.tabs.training}
                onChange={(v) =>
                  onChange((prev) => ({
                    ...prev,
                    admin: {
                      ...prev.admin,
                      tabs: { ...prev.admin.tabs, training: v },
                    },
                  }))
                }
              />
              <NavTextField
                label="配置管理（侧边栏菜单）"
                value={navigation.admin.tabs.settings}
                onChange={(v) =>
                  onChange((prev) => ({
                    ...prev,
                    admin: {
                      ...prev.admin,
                      tabs: { ...prev.admin.tabs, settings: v },
                    },
                  }))
                }
              />
            </div>
          </div>
        </div>
      )}

      {tab === 'ambassador-services' && (
        <div>
          <NavBlock
            heading={navigation.ambassadorServices.menuLabel}
            copy={{
              menuLabel: navigation.ambassadorServices.menuLabel,
              pageTitle: navigation.ambassadorServices.pageTitle,
              pageDescription: navigation.ambassadorServices.pageDescription,
            }}
            onChange={(p) =>
              onChange((prev) => ({
                ...prev,
                ambassadorServices: { ...prev.ambassadorServices, ...p },
              }))
            }
          />
          <div
            className="pt-4 mt-4 border-t grid gap-4 sm:grid-cols-2"
            style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
          >
            <NavTextField
              label="子菜单 / 页内标签"
              value={navigation.ambassadorServices.requests.menuLabel}
              onChange={(v) =>
                onChange((prev) => ({
                  ...prev,
                  ambassadorServices: {
                    ...prev.ambassadorServices,
                    requests: {
                      ...prev.ambassadorServices.requests,
                      menuLabel: v,
                    },
                  },
                }))
              }
            />
            <NavTextField
              label="子菜单 / 页内标签"
              value={navigation.ambassadorServices.visits.menuLabel}
              onChange={(v) =>
                onChange((prev) => ({
                  ...prev,
                  ambassadorServices: {
                    ...prev.ambassadorServices,
                    visits: {
                      ...prev.ambassadorServices.visits,
                      menuLabel: v,
                    },
                  },
                }))
              }
            />
            <NavTextField
              label="子菜单 / 页内标签（审批流）"
              value={navigation.approvalFlow.menuLabel}
              onChange={(v) =>
                onChange((prev) => ({
                  ...prev,
                  approvalFlow: { ...prev.approvalFlow, menuLabel: v },
                }))
              }
            />
          </div>
          <div className="pt-4 mt-2">
            <NavBlock
              heading={`${navigation.approvalFlow.menuLabel}（页内说明）`}
              copy={{
                pageTitle: navigation.approvalFlow.pageTitle,
                pageDescription: navigation.approvalFlow.pageDescription,
              }}
              onChange={(p) =>
                onChange((prev) => ({
                  ...prev,
                  approvalFlow: { ...prev.approvalFlow, ...p },
                }))
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
