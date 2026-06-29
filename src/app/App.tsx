import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { Suspense, lazy, useEffect, useState } from 'react';
import { UserProvider } from './contexts/UserContext';
import { MaterialsProvider } from './contexts/MaterialsContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { getToken } from './lib/api';
import Login from './components/Login';
import Layout from './components/Layout';

const Dashboard = lazy(() => import('./components/Dashboard'));
const AmbassadorMomentsPage = lazy(() => import('./components/AmbassadorMomentsPage'));
const ActivityAdminPage = lazy(() => import('./components/ActivityAdminPage'));
const Materials = lazy(() => import('./components/Materials'));
const MaterialViewer = lazy(() => import('./components/MaterialViewer'));
const TrainingCenter = lazy(() => import('./components/TrainingCenter'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const SettingsPage = lazy(() => import('./components/SettingsPage'));
const AmbassadorServicesLayout = lazy(() => import('./components/AmbassadorServicesLayout'));
const ServiceRequests = lazy(() => import('./components/ServiceRequests'));
const WeeklyTest = lazy(() => import('./components/WeeklyTest'));
const FinalTest = lazy(() => import('./components/FinalTest'));
const QuizPreviewPage = lazy(() => import('./components/QuizPreviewPage'));

function PageFallback() {
  return <div className="min-h-screen bg-background" />;
}

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
        <Suspense fallback={<PageFallback />}>
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
        </Suspense>
      </BrowserRouter>
      </MaterialsProvider>
    </UserProvider>
      )}
    </SettingsProvider>
  );
}
