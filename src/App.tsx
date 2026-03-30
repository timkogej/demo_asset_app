import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import Vehicles from './pages/Vehicles';
import Clients from './pages/Clients';
import Penalties from './pages/Penalties';
import Payments from './pages/Payments';
import Analytics from './pages/Analytics';
import Documents from './pages/Documents';
import { useTranslation } from './i18n/useTranslation';

function App() {
  const { t, language, setLanguage } = useTranslation();

  return (
    <BrowserRouter>
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
      <Routes>
        <Route
          path="/"
          element={<Layout t={t} language={language} setLanguage={setLanguage} />}
        >
          <Route index element={<Dashboard t={t} language={language} />} />
          <Route path="vehicles" element={<Vehicles t={t} language={language} />} />
          <Route path="clients" element={<Clients t={t} language={language} />} />
          <Route path="penalties" element={<Penalties t={t} language={language} />} />
          <Route path="payments" element={<Payments t={t} language={language} />} />
          <Route path="analytics" element={<Analytics t={t} language={language} />} />
          <Route path="documents" element={<Documents t={t} language={language} />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
