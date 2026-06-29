import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router';
import {
  GraduationCap,
  FileText,
  CheckCircle,
  TrendingUp,
} from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { useNavigationCopy } from '../hooks/useNavigationCopy';
import AdvancedTraining from './AdvancedTraining';
import SectionPageLayout from './SectionPageLayout';

type MainTab = 'overview' | 'basic' | 'advanced';

export default function TrainingCenter() {
  const { currentUser } = useUser();
  const nav = useNavigationCopy();
  const [activeTab, setActiveTab] = useState<MainTab>('overview');

  const trainingTabs = useMemo(() => {
    const tabs: {
      id: MainTab;
      label: string;
      icon: typeof TrendingUp;
      roles: string[];
    }[] = [
      {
        id: 'overview',
        label: nav.training.overview.menuLabel || '学习进度',
        icon: TrendingUp,
        roles: ['new', 'certified', 'admin'],
      },
      {
        id: 'basic',
        label: nav.training.basic.menuLabel,
        icon: FileText,
        roles: ['new', 'admin'],
      },
      {
        id: 'advanced',
        label: nav.training.advanced.menuLabel,
        icon: GraduationCap,
        roles: ['certified', 'admin'],
      },
    ];
    return tabs
      .filter((t) => t.roles.includes(currentUser.role))
      .map(({ id, label, icon }) => ({ id, label, icon }));
  }, [currentUser.role, nav.training]);

  useEffect(() => {
    const allowed = trainingTabs.map((t) => t.id);
    if (!allowed.includes(activeTab) && allowed.length > 0) {
      setActiveTab(allowed[0]);
    }
  }, [activeTab, trainingTabs]);

  const tabDescription =
    activeTab === 'overview'
      ? nav.training.overview.pageDescription
      : activeTab === 'basic'
        ? nav.training.basic.pageDescription
        : nav.training.advanced.pageDescription;

  const calculateProgress = () => {
    if (currentUser.role === 'new') {
      const completedStages = currentUser.progress.basicTrainingStages.filter(
        (s) => s.completed,
      ).length;
      const totalStages = currentUser.progress.basicTrainingStages.length;
      return Math.round((completedStages / totalStages) * 100);
    }
    if (currentUser.role === 'certified') {
      return Math.round(
        (currentUser.progress.advancedCoursesCompleted /
          currentUser.progress.totalAdvancedCourses) *
          100,
      );
    }
    const basicCompleted = currentUser.progress.basicTrainingStages.filter(
      (s) => s.completed,
    ).length;
    const basicTotal = currentUser.progress.basicTrainingStages.length;
    const basicProgress = (basicCompleted / basicTotal) * 50;
    const advancedProgress =
      (currentUser.progress.advancedCoursesCompleted /
        currentUser.progress.totalAdvancedCourses) *
      50;
    return Math.round(basicProgress + advancedProgress);
  };

  const totalProgress = calculateProgress();

  const OverviewContent = () => (
    <div>
      <div
        className="bg-white p-8 rounded-lg border mb-6"
        style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <TrendingUp className="w-5 h-5 mr-2" style={{ color: '#5EC4B6' }} />
            <h3 className="text-base font-medium" style={{ color: '#382C25' }}>
              总体进度
            </h3>
          </div>
          <span className="text-2xl font-medium" style={{ color: '#5EC4B6' }}>
            {totalProgress}%
          </span>
        </div>
        <div className="w-full h-3 rounded-full" style={{ backgroundColor: '#F5F5F5' }}>
          <div
            className="h-3 rounded-full transition-all"
            style={{
              width: `${totalProgress}%`,
              backgroundColor: '#5EC4B6',
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(currentUser.role === 'new' || currentUser.role === 'admin') && (
          <button
            type="button"
            onClick={() => setActiveTab('basic')}
            className="bg-white p-6 rounded-lg border text-left transition-all hover:shadow-sm w-full"
            style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
          >
            <div className="flex items-center mb-3">
              <FileText className="w-5 h-5 mr-2" style={{ color: '#5EC4B6' }} />
              <h3 className="text-base font-medium" style={{ color: '#382C25' }}>
                {nav.training.basic.menuLabel}
              </h3>
            </div>
            <p className="text-sm mb-4" style={{ color: '#7A6E68' }}>
              {nav.training.basic.pageDescription}
            </p>
            <span className="text-sm font-medium" style={{ color: '#5EC4B6' }}>
              进入基础培训 →
            </span>
          </button>
        )}

        {(currentUser.role === 'certified' || currentUser.role === 'admin') && (
          <button
            type="button"
            onClick={() => setActiveTab('advanced')}
            className="bg-white p-6 rounded-lg border text-left transition-all hover:shadow-sm w-full"
            style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
          >
            <div className="flex items-center mb-3">
              <GraduationCap className="w-5 h-5 mr-2" style={{ color: '#5EC4B6' }} />
              <h3 className="text-base font-medium" style={{ color: '#382C25' }}>
                {nav.training.advanced.menuLabel}
              </h3>
            </div>
            <p className="text-sm mb-4" style={{ color: '#7A6E68' }}>
              {nav.training.advanced.pageDescription}
            </p>
            <span className="text-sm font-medium" style={{ color: '#5EC4B6' }}>
              进入进阶培训 →
            </span>
          </button>
        )}
      </div>
    </div>
  );

  const BasicTrainingContent = () => (
    <div>
      <div
        className="bg-white p-5 rounded-lg border mb-4"
        style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
      >
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-medium" style={{ color: '#382C25' }}>
              基础培训考试入口
            </h3>
            <p className="text-xs mt-1" style={{ color: '#7A6E68' }}>
              可直接进入周测或知识答题，题库内容由后台题库管理发布后生效。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/weekly-test"
              className="inline-block px-3 py-1.5 rounded-full transition-all text-xs"
              style={{
                backgroundColor: '#F5F5F5',
                color: '#382C25',
                textDecoration: 'none',
                border: '1px solid rgba(56, 44, 37, 0.08)',
              }}
            >
              进入周测
            </Link>
            <Link
              to="/knowledge-test"
              className="inline-block px-3 py-1.5 rounded-full transition-all text-xs"
              style={{
                backgroundColor: '#5EC4B6',
                color: 'white',
                textDecoration: 'none',
              }}
            >
              进入知识答题
            </Link>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {currentUser.progress.basicTrainingStages.map((stage, index) => (
          <div
            key={stage.id}
            className="bg-white p-6 rounded-lg border"
            style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start flex-1">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center mr-4 shrink-0"
                  style={{
                    backgroundColor: stage.completed
                      ? 'rgba(94, 196, 182, 0.1)'
                      : '#F5F5F5',
                  }}
                >
                  {stage.completed ? (
                    <CheckCircle className="w-5 h-5" style={{ color: '#5EC4B6' }} />
                  ) : (
                    <span className="text-sm font-medium" style={{ color: '#7A6E68' }}>
                      {index + 1}
                    </span>
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-medium mb-1" style={{ color: '#382C25' }}>
                    {stage.name}
                  </h3>
                  <p className="text-sm" style={{ color: '#7A6E68' }}>
                    {stage.description}
                  </p>
                </div>
              </div>
              <div className="ml-4">
                {stage.id === 3 && !stage.completed ? (
                  <div className="flex items-center gap-2">
                    <Link
                      to="/weekly-test"
                      className="inline-block px-3 py-1 rounded-full transition-all text-xs"
                      style={{
                        backgroundColor: '#F5F5F5',
                        color: '#382C25',
                        textDecoration: 'none',
                        border: '1px solid rgba(56, 44, 37, 0.08)',
                      }}
                    >
                      进入周测
                    </Link>
                    <Link
                      to="/knowledge-test"
                      className="inline-block px-3 py-1 rounded-full transition-all text-xs"
                      style={{
                        backgroundColor: '#5EC4B6',
                        color: 'white',
                        textDecoration: 'none',
                      }}
                    >
                      进入答题
                    </Link>
                  </div>
                ) : stage.completed ? (
                  <span
                    className="px-3 py-1 rounded-full text-xs font-medium"
                    style={{ backgroundColor: 'rgba(94, 196, 182, 0.1)', color: '#5EC4B6' }}
                  >
                    ✓ 已完成
                  </span>
                ) : (
                  <span
                    className="px-3 py-1 rounded-full text-xs font-medium"
                    style={{ backgroundColor: '#F5F5F5', color: '#7A6E68' }}
                  >
                    待完成
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <SectionPageLayout
      title={nav.training.menuLabel}
      description={tabDescription}
      titleIcon={GraduationCap}
      tabs={trainingTabs}
      activeTabId={activeTab}
      onTabChange={(id) => setActiveTab(id as MainTab)}
    >
      {activeTab === 'overview' && <OverviewContent />}
      {activeTab === 'basic' && <BasicTrainingContent />}
      {activeTab === 'advanced' && <AdvancedTraining />}
    </SectionPageLayout>
  );
}
