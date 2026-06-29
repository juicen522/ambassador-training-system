import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { useState, useEffect } from 'react';
import { UserProvider } from './contexts/UserContext';
import { MaterialsProvider } from './contexts/MaterialsContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { getToken, clearToken } from './lib/api';
import Login from './components/Login';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import AmbassadorMomentsPage from './components/AmbassadorMomentsPage';
import ActivityAdminPage from './components/ActivityAdminPage';
import Materials from './components/Materials';
import MaterialViewer from './components/MaterialViewer';
import TrainingCenter from './components/TrainingCenter';
import AdminPanel from './components/AdminPanel';
import SettingsPage from './components/SettingsPage';
import AmbassadorServicesLayout from './components/AmbassadorServicesLayout';
import ServiceRequests from './components/ServiceRequests';
import WeeklyTest from './components/WeeklyTest';
import FinalTest from './components/FinalTest';
import QuizPreviewPage from './components/QuizPreviewPage';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(getToken()));

  useEffect(() => {
    if (!getToken()) setIsAuthenticated(false);
  }, []);

  return (
    <SettingsProvider>
      {!isAuthenticated ? (
        <Login
          onLogin={() => setIsAuthenticated(true)}
        />
      ) : (
    <UserProvider>
      <MaterialsProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/quiz-preview/:type" element={<QuizPreviewPage />} />
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="ambassador-moments" element={<AmbassadorMomentsPage />} />
            <Route path="ambassador-moments/admin" element={<ActivityAdminPage />} />
            <Route path="ambassador-moments/:albumId" element={<AmbassadorMomentsPage />} />
            <Route path="materials" element={<Materials />} />
            <Route path="materials/:materialId" element={<MaterialViewer />} />
            <Route path="training" element={<TrainingCenter />} />
            <Route path="weekly-test" element={<WeeklyTest />} />
            <Route path="knowledge-test" element={<FinalTest />} />
            <Route path="service-requests" element={<ServiceRequests />} />
            <Route
              path="service-requests/new"
              element={<Navigate to="/service-requests" replace />}
            />
            <Route
              path="service-requests/applications"
              element={<Navigate to="/service-requests" replace />}
            />
            <Route path="ambassador-work" element={<ServiceRequests />} />
            <Route
              path="ambassador-work/tasks"
              element={<Navigate to="/ambassador-work" replace />}
            />
            <Route
              path="ambassador-work/report"
              element={<Navigate to="/ambassador-work" replace />}
            />
            <Route
              path="service-requests/tasks"
              element={<Navigate to="/ambassador-work" replace />}
            />
            <Route
              path="service-requests/report"
              element={<Navigate to="/ambassador-work" replace />}
            />
            <Route path="admin" element={<AdminPanel />} />
            <Route
              path="approval-flow"
              element={<Navigate to="/ambassador-services?tab=approval" replace />}
            />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="ambassador-services" element={<AmbassadorServicesLayout />} />
            <Route
              path="ambassador-services/requests"
              element={<Navigate to="/ambassador-services" replace />}
            />
            <Route
              path="ambassador-services/visits"
              element={<Navigate to="/ambassador-services" replace />}
            />
          </Route>
        </Routes>
      </BrowserRouter>
      </MaterialsProvider>
    </UserProvider>
      )}
    </SettingsProvider>
  );
}