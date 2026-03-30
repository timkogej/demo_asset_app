import { useLocation } from 'react-router-dom';
import { format } from 'date-fns';
import { Menu } from 'lucide-react';

interface TopBarProps {
  t: (key: string) => string;
  onOpenMobile: () => void;
}

const routeTitles: Record<string, string> = {
  '/': 'nav.dashboard',
  '/vehicles': 'nav.vehicles',
  '/clients': 'nav.clients',
  '/penalties': 'nav.penalties',
  '/payments': 'nav.payments',
  '/analytics': 'nav.analytics',
};

export default function TopBar({ t, onOpenMobile }: TopBarProps) {
  const location = useLocation();
  const titleKey = routeTitles[location.pathname] || 'nav.dashboard';
  const today = format(new Date(), 'dd/MM/yyyy');

  return (
    <header className="h-14 bg-surface border-b border-accent-soft flex items-center justify-between px-6 sticky top-0 z-20">
      <div className="flex items-center gap-3">
        {/* Hamburger - mobile only */}
        <button
          onClick={onOpenMobile}
          className="md:hidden p-2 -ml-2 rounded-10 text-text-muted hover:bg-accent-soft hover:text-text-dark transition-colors"
          aria-label="Odpri meni"
        >
          <Menu size={20} />
        </button>
        <h1 className="text-lg font-semibold text-text-dark">{t(titleKey)}</h1>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-text-muted">{today}</span>
      </div>
    </header>
  );
}
