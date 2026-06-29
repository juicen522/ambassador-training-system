import { useEffect } from 'react';
import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import AdminActivitiesPanel from './AdminActivitiesPanel';
import { dispatchFlushActivityDraft } from '../lib/activityEditorSession';

export default function ActivityAdminPage() {
  const { currentUser } = useUser();

  useEffect(() => {
    return () => {
      dispatchFlushActivityDraft();
    };
  }, []);

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
            活动管理仅限管理员访问
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <Link
        to="/ambassador-moments"
        className="inline-flex items-center gap-1.5 text-sm mb-6 transition-colors hover:opacity-80"
        style={{ color: '#7A6E68' }}
      >
        <ArrowLeft className="w-4 h-4" />
        返回大使日常互动
      </Link>

      <AdminActivitiesPanel />
    </div>
  );
}
