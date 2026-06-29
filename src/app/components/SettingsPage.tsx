import { Navigate } from 'react-router';
import { useUser } from '../contexts/UserContext';
import { useNavigationCopy } from '../hooks/useNavigationCopy';
import AdminSettings from './AdminSettings';

export default function SettingsPage() {
  const { currentUser } = useUser();
  const nav = useNavigationCopy();

  if (currentUser.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <AdminSettings pageTitle={nav.admin.tabs.settings} />
    </div>
  );
}
