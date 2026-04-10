import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import Layout from './components/layout/Layout';
import { LoginPage } from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import Vehicles from './pages/Vehicles';
import Clients from './pages/Clients';
import Penalties from './pages/Penalties';
import Payments from './pages/Payments';
import Analytics from './pages/Analytics';
import Documents from './pages/Documents';
import Settings from './pages/Settings';
import Invoices from './pages/Invoices';
import { useTranslation } from './i18n/useTranslation';

function AppRoutes() {
  const { t, language, setLanguage } = useTranslation();

  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout t={t} language={language} setLanguage={setLanguage} />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard t={t} language={language} />} />
        <Route path="vehicles" element={<Vehicles t={t} language={language} />} />
        <Route path="clients" element={<Clients t={t} language={language} />} />
        <Route path="penalties" element={<Penalties t={t} language={language} />} />
        <Route path="payments" element={<Payments t={t} language={language} />} />
        <Route path="analytics" element={<Analytics t={t} language={language} />} />
        <Route path="documents" element={<Documents t={t} language={language} />} />
        <Route path="settings" element={<Settings t={t} language={language} />} />
        <Route path="invoices" element={<Invoices t={t} language={language} />} />
      </Route>

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '13px',
              borderRadius: '10px',
              border: '1px solid #a8d4b3',
            },
            success: {
              style: {
                background: '#d4ead9',
                color: '#1a4731',
              },
              iconTheme: {
                primary: '#2d7a4f',
                secondary: '#d4ead9',
              },
            },
            error: {
              style: {
                background: '#fee2e2',
                color: '#c0392b',
              },
            },
          }}
        />
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
