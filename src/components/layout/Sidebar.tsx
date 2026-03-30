import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Car,
  Users,
  AlertTriangle,
  CreditCard,
  BarChart2,
} from 'lucide-react';
import type { Language } from '../../types';

interface SidebarProps {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const navItems = [
  { path: '/', label: 'nav.dashboard', icon: LayoutDashboard, end: true },
  { path: '/vehicles', label: 'nav.vehicles', icon: Car, end: false },
  { path: '/clients', label: 'nav.clients', icon: Users, end: false },
  { path: '/penalties', label: 'nav.penalties', icon: AlertTriangle, end: false },
  { path: '/payments', label: 'nav.payments', icon: CreditCard, end: false },
  { path: '/analytics', label: 'nav.analytics', icon: BarChart2, end: false },
];

export default function Sidebar({ language, setLanguage, t }: SidebarProps) {
  return (
    <aside
      className="fixed left-0 top-0 h-screen bg-surface border-r border-accent-muted flex flex-col z-30"
      style={{ width: 240 }}
    >
      {/* Logo */}
      <div className="px-5 py-5 border-b border-accent-soft">
        <span
          className="text-2xl font-bold text-primary"
          style={{ fontFamily: "'Fraunces', serif" }}
        >
          FleetInvoice
        </span>
        <p className="text-xs text-text-muted mt-0.5">Fleet leasing manager</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-0.5 px-3">
          {navItems.map(({ path, label, icon: Icon, end }) => (
            <li key={path}>
              <NavLink
                to={path}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-10 text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-accent-soft text-primary border-l-[3px] border-primary pl-[9px]'
                      : 'text-text-muted hover:bg-accent-soft/50 hover:text-text-dark border-l-[3px] border-transparent pl-[9px]'
                  }`
                }
              >
                <Icon size={17} strokeWidth={1.8} />
                <span>{t(label)}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Language toggle */}
      <div className="px-5 py-4 border-t border-accent-soft">
        <p className="text-xs text-text-muted mb-2 font-medium uppercase tracking-wider">
          Language
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setLanguage('it')}
            className={`flex-1 py-1.5 rounded-10 text-xs font-semibold transition-colors duration-150 ${
              language === 'it'
                ? 'bg-primary text-white'
                : 'bg-bg text-text-muted hover:bg-accent-soft border border-accent-muted'
            }`}
          >
            IT
          </button>
          <button
            onClick={() => setLanguage('sl')}
            className={`flex-1 py-1.5 rounded-10 text-xs font-semibold transition-colors duration-150 ${
              language === 'sl'
                ? 'bg-primary text-white'
                : 'bg-bg text-text-muted hover:bg-accent-soft border border-accent-muted'
            }`}
          >
            SL
          </button>
        </div>
      </div>
    </aside>
  );
}
