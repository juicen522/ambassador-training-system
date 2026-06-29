import { Outlet, Link, useLocation } from 'react-router';
import {
  Home,
  BookOpen,
  GraduationCap,
  Users,
  User,
  ClipboardList,
  ListChecks,
  BarChart3,
  UserCheck,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Settings,
} from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { useSettings } from '../contexts/SettingsContext';
import { useNavigationCopy } from '../hooks/useNavigationCopy';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getStoredUsername } from '../lib/api';
import { dispatchFlushActivityDraft } from '../lib/activityEditorSession';
import {
  fetchAdminPendingBadge,
  fetchApplicationsBadge,
  fetchMyAssignedServiceRequests,
} from '../lib/serviceRequestApi';
import { SWITCHABLE_ACCOUNTS } from '../lib/switchableAccounts';

interface NavItem {
  path: string;
  icon: typeof Home;
  label: string;
  roles: string[];
  badge?: number;
  badgeWarning?: boolean;
}

export default function Layout() {
  const location = useLocation();
  const { currentUser, switchAccount, switchingAccount } = useUser();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const { publicSettings, revision } = useSettings();
  const nav = useNavigationCopy();
  const [applicationsBadge, setApplicationsBadge] = useState({
    returned: 0,
    pending: 0,
  });
  const [assignedTaskCount, setAssignedTaskCount] = useState(0);
  const [adminPendingBadge, setAdminPendingBadge] = useState({
    pendingRequests: 0,
    pendingManualPoints: 0,
  });

  const loadNavBadges = useCallback(async () => {
    try {
      const badge = await fetchApplicationsBadge();
      setApplicationsBadge(badge);
    } catch {
      setApplicationsBadge({ returned: 0, pending: 0 });
    }
    if (currentUser.role === 'certified' || currentUser.role === 'admin') {
      try {
        const list = await fetchMyAssignedServiceRequests();
        setAssignedTaskCount(list.filter((r) => r.status === 'accepted').length);
      } catch {
        setAssignedTaskCount(0);
      }
    } else {
      setAssignedTaskCount(0);
    }
    if (currentUser.role === 'admin') {
      try {
        const adminBadge = await fetchAdminPendingBadge();
        setAdminPendingBadge(adminBadge);
      } catch {
        setAdminPendingBadge({ pendingRequests: 0, pendingManualPoints: 0 });
      }
    } else {
      setAdminPendingBadge({ pendingRequests: 0, pendingManualPoints: 0 });
    }
  }, [currentUser.role]);

  useEffect(() => {
    void loadNavBadges();
    const onUpdate = () => void loadNavBadges();
    window.addEventListener('service-requests-updated', onUpdate);
    window.addEventListener('focus', onUpdate);
    return () => {
      window.removeEventListener('service-requests-updated', onUpdate);
      window.removeEventListener('focus', onUpdate);
    };
  }, [loadNavBadges, currentUser.id, location.pathname]);

  useEffect(() => {
    const onSettingsUpdated = () => void loadNavBadges();
    window.addEventListener('app-settings-updated', onSettingsUpdated);
    return () => window.removeEventListener('app-settings-updated', onSettingsUpdated);
  }, [loadNavBadges]);

  /** 仅「被退回需修改」算待办；pending 为待管理员处理，不需发起人操作 */
  const appsBadgeCount = applicationsBadge.returned;
  const appsBadgeWarning = applicationsBadge.returned > 0;

  const adminServicesBadgeCount =
    adminPendingBadge.pendingRequests + adminPendingBadge.pendingManualPoints;

  const serviceNav = nav.service;

  const navItems: NavItem[] = useMemo(
    () => [
      {
        path: '/dashboard',
        icon: Home,
        label: nav.dashboard.menuLabel,
        roles: ['new', 'certified', 'admin'],
      },
      {
        path: '/materials',
        icon: BookOpen,
        label: nav.materials.menuLabel,
        roles: ['new', 'certified', 'admin'],
      },
      {
        path: '/service-requests',
        icon: ClipboardList,
        label: serviceNav.demandsGroupLabel,
        roles: ['new', 'certified', 'admin'],
        badge: appsBadgeCount > 0 ? appsBadgeCount : undefined,
        badgeWarning: appsBadgeWarning,
      },
      {
        path: '/ambassador-work',
        icon: UserCheck,
        label: serviceNav.workGroupLabel,
        roles: ['certified', 'admin'],
        badge: assignedTaskCount > 0 ? assignedTaskCount : undefined,
        badgeWarning: true,
      },
      {
        path: '/training',
        icon: GraduationCap,
        label: nav.training.menuLabel,
        roles: ['new', 'certified', 'admin'],
      },
      {
        path: '/admin',
        icon: Users,
        label: nav.admin.menuLabel,
        roles: ['admin'],
      },
      {
        path: '/ambassador-services',
        icon: ListChecks,
        label: nav.ambassadorServices.menuLabel,
        roles: ['admin'],
        badge: adminServicesBadgeCount > 0 ? adminServicesBadgeCount : undefined,
        badgeWarning: adminServicesBadgeCount > 0,
      },
      {
        path: '/settings',
        icon: Settings,
        label: nav.admin.tabs.settings,
        roles: ['admin'],
      },
    ],
    [
      nav,
      serviceNav,
      revision,
      appsBadgeCount,
      appsBadgeWarning,
      assignedTaskCount,
      adminServicesBadgeCount,
    ],
  );

  const filterNavItems = (items: NavItem[]): NavItem[] =>
    items.filter((item) => item.roles.includes(currentUser.role));

  const visibleNavItems = filterNavItems(navItems);

  const currentUsername = getStoredUsername();

  const accountGroups = useMemo(() => {
    const groups = new Map<string, typeof SWITCHABLE_ACCOUNTS>();
    for (const a of SWITCHABLE_ACCOUNTS) {
      const list = groups.get(a.group) ?? [];
      list.push(a);
      groups.set(a.group, list);
    }
    return [...groups.entries()];
  }, []);

  const getRoleName = (role: string) => {
    switch (role) {
      case 'new':
        return '全新大使';
      case 'certified':
        return '正式大使';
      case 'admin':
        return '管理员';
      default:
        return '';
    }
  };

  return (
    <div className="flex h-screen" style={{ backgroundColor: '#FAFAFA' }}>
      <aside
        className="w-64 bg-white border-r flex flex-col"
        style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
      >
        <div className="p-6 border-b" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
          <h1 className="text-xl font-medium" style={{ color: '#382C25' }}>
            {publicSettings.system.siteName}
          </h1>
        </div>

        <nav className="p-3 flex-1 overflow-y-auto">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              location.pathname === item.path ||
              (item.path === '/dashboard' &&
                location.pathname.startsWith('/ambassador-moments')) ||
              (item.path === '/materials' &&
                location.pathname.startsWith('/materials')) ||
              (item.path === '/service-requests' &&
                location.pathname.startsWith('/service-requests')) ||
              (item.path === '/ambassador-work' &&
                location.pathname.startsWith('/ambassador-work')) ||
              (item.path === '/training' && location.pathname.startsWith('/training')) ||
              (item.path === '/ambassador-services' &&
                location.pathname.startsWith('/ambassador-services')) ||
              (item.path === '/settings' && location.pathname.startsWith('/settings'));

            return (
              <Link
                key={item.path}
                to={item.path}
                className="flex items-center px-4 py-3 rounded-lg mb-1 transition-all"
                style={{
                  backgroundColor: isActive ? 'rgba(94, 196, 182, 0.1)' : 'transparent',
                  color: isActive ? '#5EC4B6' : '#7A6E68',
                }}
                onClick={() => {
                  if (location.pathname.startsWith('/ambassador-moments/admin')) {
                    dispatchFlushActivityDraft();
                  }
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = '#F5F5F5';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <Icon className="w-5 h-5 mr-3 shrink-0" />
                <span className="text-sm flex-1">{item.label}</span>
                {item.badge != null && item.badge > 0 && (
                  <span
                    className="shrink-0 ml-2 text-xs min-w-[1.25rem] h-5 px-1.5 rounded-full flex items-center justify-center font-medium"
                    style={
                      item.badgeWarning
                        ? {
                            backgroundColor: 'rgba(251, 191, 36, 0.25)',
                            color: '#B45309',
                          }
                        : {
                            backgroundColor: 'rgba(94, 196, 182, 0.2)',
                            color: '#5EC4B6',
                          }
                    }
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
          <div className="flex items-center mb-2">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center mr-3 shrink-0"
              style={{ backgroundColor: 'rgba(94, 196, 182, 0.1)' }}
            >
              <User className="w-5 h-5" style={{ color: '#5EC4B6' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: '#382C25' }}>
                {currentUser.name}
              </p>
              <p className="text-xs truncate" style={{ color: '#7A6E68' }}>
                {getRoleName(currentUser.role)}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={switchingAccount}
            onClick={() => setAccountMenuOpen((o) => !o)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs border transition-all disabled:opacity-50"
            style={{
              borderColor: 'rgba(56, 44, 37, 0.12)',
              color: '#7A6E68',
              backgroundColor: accountMenuOpen ? '#F5F5F5' : 'white',
            }}
          >
            <span className="flex items-center gap-1.5">
              <RefreshCw
                className={`w-3.5 h-3.5 ${switchingAccount ? 'animate-spin' : ''}`}
              />
              {switchingAccount ? '切换中…' : '切换账号'}
            </span>
            {accountMenuOpen ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
          {accountMenuOpen && (
            <div
              className="mt-2 max-h-48 overflow-y-auto rounded-lg border"
              style={{ borderColor: 'rgba(56, 44, 37, 0.08)' }}
            >
              {accountGroups.map(([group, accounts]) => (
                <div key={group}>
                  <p
                    className="px-3 py-1.5 text-[10px] font-medium sticky top-0"
                    style={{
                      color: '#B45309',
                      backgroundColor: '#FAFAFA',
                    }}
                  >
                    {group}
                  </p>
                  {accounts.map((acc) => {
                    const isCurrent = currentUsername === acc.username;
                    return (
                      <button
                        key={acc.username}
                        type="button"
                        disabled={switchingAccount || isCurrent}
                        onClick={() => void switchAccount(acc.username)}
                        className="w-full text-left px-3 py-2 text-xs border-t transition-colors disabled:opacity-60"
                        style={{
                          borderColor: 'rgba(56, 44, 37, 0.06)',
                          backgroundColor: isCurrent
                            ? 'rgba(94, 196, 182, 0.12)'
                            : 'transparent',
                          color: isCurrent ? '#5EC4B6' : '#382C25',
                        }}
                      >
                        <span className="font-medium block">{acc.name}</span>
                        <span style={{ color: '#7A6E68' }}>{acc.roleLabel}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
