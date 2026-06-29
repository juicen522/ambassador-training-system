import { useCallback, useEffect, useState } from 'react';
import { ListChecks, ClipboardList, BarChart3, FileSpreadsheet, GitBranch } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { useUser } from '../contexts/UserContext';
import { useNavigationCopy } from '../hooks/useNavigationCopy';
import { fetchAdminPendingBadge } from '../lib/serviceRequestApi';
import SectionPageLayout from './SectionPageLayout';
import AdminServiceRequests from './AdminServiceRequests';
import AdminAmbassadorServices from './AdminAmbassadorServices';
import AmbassadorStaffManagement from './AmbassadorStaffManagement';
import ApprovalFlowPage from './ApprovalFlowPage';

type AdminServicesTab = 'requests' | 'visits' | 'approval' | 'reports';

function parseServicesTab(value: string | null): AdminServicesTab {
  if (value === 'visits' || value === 'approval' || value === 'reports') return value;
  if (value === 'staff') return 'approval';
  return 'requests';
}

export default function AmbassadorServicesLayout() {
  const { currentUser } = useUser();
  const nav = useNavigationCopy();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<AdminServicesTab>(() =>
    parseServicesTab(searchParams.get('tab')),
  );
  const [pendingBadge, setPendingBadge] = useState({
    pendingRequests: 0,
    pendingManualPoints: 0,
  });

  const loadPendingBadge = useCallback(async () => {
    try {
      const data = await fetchAdminPendingBadge();
      setPendingBadge(data);
    } catch {
      setPendingBadge({ pendingRequests: 0, pendingManualPoints: 0 });
    }
  }, []);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const tab = parseServicesTab(tabParam);
    setActiveTab(tab);
    if (tabParam === 'staff') {
      setSearchParams({ tab: 'approval', panel: 'staff' }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (currentUser.role !== 'admin') return;
    void loadPendingBadge();
    const onUpdate = () => void loadPendingBadge();
    window.addEventListener('service-requests-updated', onUpdate);
    window.addEventListener('focus', onUpdate);
    return () => {
      window.removeEventListener('service-requests-updated', onUpdate);
      window.removeEventListener('focus', onUpdate);
    };
  }, [currentUser.role, loadPendingBadge]);

  if (currentUser.role !== 'admin') {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div
          className="bg-white p-12 rounded-lg border text-center"
          style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
        >
          <h2 className="text-2xl font-medium mb-3" style={{ color: '#382C25' }}>
            无访问权限
          </h2>
          <p className="text-sm" style={{ color: '#7A6E68' }}>
            大使服务仅限管理员访问
          </p>
        </div>
      </div>
    );
  }

  const sectionTabs = [
    {
      id: 'requests' as const,
      label: nav.ambassadorServices.requests.menuLabel,
      icon: ClipboardList,
      badge:
        pendingBadge.pendingRequests > 0 ? pendingBadge.pendingRequests : undefined,
      badgeWarning: pendingBadge.pendingRequests > 0,
    },
    {
      id: 'visits' as const,
      label: nav.ambassadorServices.visits.menuLabel,
      icon: BarChart3,
      badge:
        pendingBadge.pendingManualPoints > 0
          ? pendingBadge.pendingManualPoints
          : undefined,
      badgeWarning: pendingBadge.pendingManualPoints > 0,
    },
    {
      id: 'approval' as const,
      label: nav.approvalFlow.menuLabel,
      icon: GitBranch,
    },
    {
      id: 'reports' as const,
      label: '考试报告',
      icon: FileSpreadsheet,
    },
  ];

  return (
    <SectionPageLayout
      title={nav.ambassadorServices.pageTitle}
      description={nav.ambassadorServices.pageDescription}
      titleIcon={ListChecks}
      tabs={sectionTabs}
      activeTabId={activeTab}
      onTabChange={(id) => {
        const next = id as AdminServicesTab;
        setActiveTab(next);
        if (next === 'requests') {
          setSearchParams({}, { replace: true });
        } else if (next === 'approval') {
          setSearchParams({ tab: 'approval', panel: 'flow' }, { replace: true });
        } else {
          setSearchParams({ tab: next }, { replace: true });
        }
      }}
    >
      {activeTab === 'requests' ? (
        <AdminServiceRequests />
      ) : activeTab === 'visits' ? (
        <AdminAmbassadorServices />
      ) : activeTab === 'approval' ? (
        <ApprovalFlowPage embedded />
      ) : (
        <AmbassadorStaffManagement />
      )}
    </SectionPageLayout>
  );
}
