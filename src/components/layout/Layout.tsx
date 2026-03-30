import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import type { Language } from '../../types';

interface LayoutProps {
  t: (key: string) => string;
  language: Language;
  setLanguage: (lang: Language) => void;
}

export default function Layout({ t, language, setLanguage }: LayoutProps) {
  return (
    <div className="flex h-screen bg-bg overflow-hidden">
      <Sidebar t={t} language={language} setLanguage={setLanguage} />
      <div className="flex flex-col flex-1 overflow-hidden" style={{ marginLeft: 240 }}>
        <TopBar t={t} />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="animate-fadeIn">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
