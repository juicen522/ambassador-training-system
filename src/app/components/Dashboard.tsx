import { CheckCircle, Clock } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { useNavigationCopy } from '../hooks/useNavigationCopy';
import AmbassadorMomentsPreview from './AmbassadorMomentsPreview';

export default function Dashboard() {
  const { currentUser } = useUser();
  const nav = useNavigationCopy();

  // 根据角色显示不同的最近活动
  const getRecentActivitiesForRole = () => {
    if (currentUser.role === 'new') {
      return [
        { title: '完成知识答题', date: '2026-05-18' },
        { title: '查阅资料：园林植物识别', date: '2026-05-17' },
        { title: '完成十如故事+讲解重点', date: '2026-05-11' },
      ];
    } else if (currentUser.role === 'certified') {
      return [
        { title: '完成进阶课程：高级讲解技巧', date: '2026-05-18' },
        { title: '完成进阶课程：特殊人群服务', date: '2026-05-15' },
        { title: '查阅资料：园林美学鉴赏', date: '2026-05-12' },
      ];
    } else {
      return [
        { title: '审核新大使培训进度', date: '2026-05-19' },
        { title: '完成进阶课程：高级讲解技巧', date: '2026-05-18' },
        { title: '查看培训数据报告', date: '2026-05-17' },
      ];
    }
  };

  // 根据角色显示不同的待完成任务
  const getUpcomingTasksForRole = () => {
    if (currentUser.role === 'new') {
      return [
        { title: '讲解演练', deadline: '2026-05-24' },
        { title: '讲解考核', deadline: '2026-06-01' },
      ];
    } else if (currentUser.role === 'certified') {
      return [
        { title: '园林美学与鉴赏课程', deadline: '2026-05-28' },
        { title: '文化历史深度解读', deadline: '2026-06-05' },
      ];
    } else {
      return [
        { title: '月度培训总结', deadline: '2026-05-31' },
        { title: '新大使考核评估', deadline: '2026-06-05' },
      ];
    }
  };

  const recentActivities = getRecentActivitiesForRole();
  const upcomingTasks = getUpcomingTasksForRole();

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-10">
        <h1 className="text-2xl font-medium mb-1" style={{ color: '#382C25' }}>
          {nav.dashboard.pageTitle}
        </h1>
        <p className="text-sm" style={{ color: '#7A6E68' }}>
          {nav.dashboard.pageDescription}
        </p>
      </div>

      <AmbassadorMomentsPreview />

      {/* Recent Activities & Upcoming Tasks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Recent Activities */}
        <div className="bg-white p-6 rounded-lg border" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
          <div className="flex items-center mb-5">
            <CheckCircle className="w-5 h-5 mr-2" style={{ color: '#5EC4B6' }} />
            <h2 className="text-base font-medium" style={{ color: '#382C25' }}>
              最近活动
            </h2>
          </div>
          <div className="space-y-4">
            {recentActivities.map((activity, index) => (
              <div key={index} className="pb-4 border-b last:border-b-0" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
                <p className="text-sm font-medium mb-1" style={{ color: '#382C25' }}>
                  {activity.title}
                </p>
                <p className="text-xs mb-1" style={{ color: '#7A6E68' }}>
                  {activity.date}
                </p>
                {activity.score && (
                  <p className="text-xs font-medium" style={{ color: '#5EC4B6' }}>
                    得分: {activity.score}分
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming Tasks */}
        <div className="bg-white p-6 rounded-lg border" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
          <div className="flex items-center mb-5">
            <Clock className="w-5 h-5 mr-2" style={{ color: '#5EC4B6' }} />
            <h2 className="text-base font-medium" style={{ color: '#382C25' }}>
              待完成任务
            </h2>
          </div>
          <div className="space-y-4">
            {upcomingTasks.map((task, index) => (
              <div key={index} className="pb-4 border-b last:border-b-0" style={{ borderColor: 'rgba(56, 44, 37, 0.06)' }}>
                <p className="text-sm font-medium mb-1" style={{ color: '#382C25' }}>
                  {task.title}
                </p>
                <p className="text-xs" style={{ color: '#7A6E68' }}>
                  截止: {task.deadline}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
