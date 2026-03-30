interface BadgeProps {
  status: string;
  t: (key: string) => string;
}

export default function Badge({ status, t }: BadgeProps) {
  const getClasses = (): string => {
    switch (status) {
      case 'active':
      case 'paid':
      case 'success':
        return 'bg-accent-soft text-success';
      case 'maintenance':
      case 'sent':
      case 'draft':
        return 'bg-amber-50 text-amber-800';
      case 'returning':
      case 'overdue':
        return 'bg-red-50 text-danger';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getLabel = (): string => {
    const key = `status.${status}`;
    const translated = t(key);
    return translated !== key ? translated : status;
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getClasses()}`}
    >
      {getLabel()}
    </span>
  );
}
