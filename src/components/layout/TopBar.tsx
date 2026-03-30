import { useLocation } from 'react-router-dom';
import { format } from 'date-fns';

interface TopBarProps {
  t: (key: string) => string;
}

const routeTitles: Record<string, string> = {
  '/': 'nav.dashboard',
  '/vehicles': 'nav.vehicles',
  '/clients': 'nav.clients',
  '/penalties': 'nav.penalties',
  '/payments': 'nav.payments',
  '/analytics': 'nav.analytics',
};

export default function TopBar({ t }: TopBarProps) {
  const location = useLocation();
  const titleKey = routeTitles[location.pathname] || 'nav.dashboard';
  const today = format(new Date(), 'dd/MM/yyyy');

  return (
    <header className="h-14 bg-surface border-b border-accent-soft flex items-center justify-between px-6 sticky top-0 z-20">
      <h1 className="text-lg font-semibold text-text-dark">{t(titleKey)}</h1>
      <div className="flex items-center gap-4">
        <span className="text-sm text-text-muted">{today}</span>
        <div
          className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold select-none"
          title="User"
        >
          FI
        </div>
      </div>
    </header>
  );
}
