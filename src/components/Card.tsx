import { ReactNode } from 'react';
import { useTheme } from '../context/ThemeContext';

interface CardProps {
  title?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function Card({ title, icon, children, className = '', bodyClassName = '' }: CardProps) {
  const { theme } = useTheme();
  return (
    <div
      className={`rounded-xl border overflow-hidden ${className}`}
      style={{ backgroundColor: theme.cardBg, borderColor: theme.cardBorder }}
    >
      {title && (
        <div className="px-5 pt-4 pb-2 flex items-center gap-2">
          {icon && <span style={{ color: theme.accent }}>{icon}</span>}
          <h3 className="text-sm font-bold" style={{ color: theme.accent }}>{title}</h3>
        </div>
      )}
      <div className={`px-5 pb-5 ${bodyClassName}`}>{children}</div>
    </div>
  );
}
