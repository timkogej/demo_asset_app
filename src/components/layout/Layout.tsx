import { useState } from 'react';
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
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen bg-bg overflow-hidden">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <Sidebar
        t={t}
        language={language}
        setLanguage={setLanguage}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed(c => !c)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div
        className={`flex flex-col flex-1 overflow-hidden transition-[margin-left] duration-300 ${
          collapsed ? 'md:ml-16' : 'md:ml-60'
        }`}
      >
        <TopBar t={t} onOpenMobile={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="animate-fadeIn">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
