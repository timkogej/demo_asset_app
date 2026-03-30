import type { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  subtitle?: string;
  iconColor?: string;
}

export default function KpiCard({
  icon: Icon,
  label,
  value,
  subtitle,
  iconColor = 'text-accent',
}: KpiCardProps) {
  return (
    <div className="card p-5 flex items-start gap-4">
      <div className={`mt-0.5 ${iconColor}`}>
        <Icon size={22} strokeWidth={1.8} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-text-muted font-medium uppercase tracking-wider mb-1">{label}</p>
        <p className="text-2xl font-bold text-text-dark leading-tight">{value}</p>
        {subtitle && <p className="text-xs text-text-muted mt-1">{subtitle}</p>}
      </div>
    </div>
  );
}
