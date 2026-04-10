import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Car,
  Users,
  AlertTriangle,
  CreditCard,
  BarChart2,
  FolderOpen,
  Settings,
  FileText,
  ChevronLeft,
  ChevronRight,
  X,
  LogOut,
  User,
} from 'lucide-react';
import type { Language } from '../../types';
import { useAuth } from '../../context/AuthContext';

interface SidebarProps {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const navItems = [
  { path: '/', label: 'nav.dashboard', icon: LayoutDashboard, end: true },
  { path: '/vehicles', label: 'nav.vehicles', icon: Car, end: false },
  { path: '/clients', label: 'nav.clients', icon: Users, end: false },
  { path: '/invoices', label: 'nav.invoices', icon: FileText, end: false },
  { path: '/penalties', label: 'nav.penalties', icon: AlertTriangle, end: false },
  { path: '/payments', label: 'nav.payments', icon: CreditCard, end: false },
  { path: '/analytics', label: 'nav.analytics', icon: BarChart2, end: false },
  { path: '/documents', label: 'nav.documents', icon: FolderOpen, end: false },
];

const bottomNavItems = [
  { path: '/settings', label: 'nav.settings', icon: Settings, end: false },
];

export default function Sidebar({
  language,
  setLanguage,
  t,
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const sidebarWidth = collapsed ? 64 : 240;
  const { username, signOut } = useAuth();

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-surface border-r border-accent-muted flex flex-col z-50 transition-[transform,width] duration-300 ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      } md:translate-x-0`}
      style={{ width: sidebarWidth }}
    >
      {/* Logo */}
      <div
        className={`border-b border-accent-soft flex items-center gap-2 ${
          collapsed ? 'px-3 py-5 justify-center' : 'px-5 py-5'
        }`}
      >
        {collapsed ? (
          <span
            className="text-xl font-bold text-primary"
            style={{ fontFamily: "'Fraunces', serif" }}
          >
            F
          </span>
        ) : (
          <div className="flex-1 min-w-0">
            <span
              className="text-2xl font-bold text-primary"
              style={{ fontFamily: "'Fraunces', serif" }}
            >
              FleetInvoice
            </span>
            <p className="text-xs text-text-muted mt-0.5">Fleet leasing manager</p>
          </div>
        )}
        {/* Mobile close button */}
        <button
          onClick={onCloseMobile}
          className="md:hidden p-1 text-text-muted hover:text-text-dark ml-auto flex-shrink-0"
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-0.5 px-2">
          {navItems.map(({ path, label, icon: Icon, end }) => (
            <li key={path}>
              <NavLink
                to={path}
                end={end}
                onClick={onCloseMobile}
                title={collapsed ? t(label) : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-10 text-sm font-medium transition-all duration-150 ${
                    collapsed ? 'justify-center' : ''
                  } ${
                    isActive
                      ? 'bg-accent-soft text-primary border-l-[3px] border-primary pl-[9px]'
                      : 'text-text-muted hover:bg-accent-soft/50 hover:text-text-dark border-l-[3px] border-transparent pl-[9px]'
                  }`
                }
              >
                <Icon size={17} strokeWidth={1.8} />
                {!collapsed && <span>{t(label)}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Bottom nav items (Settings) */}
      <div className="px-2 pb-1">
        <ul className="space-y-0.5">
          {bottomNavItems.map(({ path, label, icon: Icon, end }) => (
            <li key={path}>
              <NavLink
                to={path}
                end={end}
                onClick={onCloseMobile}
                title={collapsed ? t(label) : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-10 text-sm font-medium transition-all duration-150 ${
                    collapsed ? 'justify-center' : ''
                  } ${
                    isActive
                      ? 'bg-accent-soft text-primary border-l-[3px] border-primary pl-[9px]'
                      : 'text-text-muted hover:bg-accent-soft/50 hover:text-text-dark border-l-[3px] border-transparent pl-[9px]'
                  }`
                }
              >
                <Icon size={17} strokeWidth={1.8} />
                {!collapsed && <span>{t(label)}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>

      {/* User / Logout */}
      <div className={`px-3 py-3 border-t border-accent-soft flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
        {!collapsed && (
          <div className="flex items-center gap-2 min-w-0">
            <User size={16} strokeWidth={1.5} className="text-text-muted flex-shrink-0" />
            <span className="text-sm font-medium text-text-dark truncate">{username}</span>
          </div>
        )}
        <button
          onClick={signOut}
          title="Esci / Odjava"
          className="p-1.5 rounded-10 text-text-muted hover:bg-accent-soft hover:text-text-dark transition-colors flex-shrink-0"
        >
          <LogOut size={16} strokeWidth={1.5} />
        </button>
      </div>

      {/* Language toggle - hidden when collapsed */}
      {!collapsed && (
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
      )}

      {/* Collapse toggle - desktop only */}
      <div className="hidden md:flex px-3 py-3 border-t border-accent-soft justify-end">
        <button
          onClick={onToggleCollapsed}
          className="p-1.5 rounded-10 text-text-muted hover:bg-accent-soft hover:text-text-dark transition-colors"
          title={collapsed ? 'Razširi stransko vrstico' : 'Skrči stransko vrstico'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </aside>
  );
}
