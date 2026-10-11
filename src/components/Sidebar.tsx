import { Sun, Moon, LogOut, KeyRound } from 'lucide-react';

interface NavItem {
  id: string;
  label: string;
  icon: string;
}

interface SidebarProps {
  activeItem: string;
  onNavigate: (id: string) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  onLogout: () => void;
  onChangePassword?: () => void;
  items: NavItem[];
  title: string;
  subtitle?: string;
  userBadge?: string;
}

export default function Sidebar({
  activeItem,
  onNavigate,
  isDark,
  onToggleTheme,
  onLogout,
  onChangePassword,
  items,
  title,
  subtitle,
  userBadge,
}: SidebarProps) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">A</div>
        <div className="sidebar-title">{title}</div>
        {subtitle && <div className="sidebar-subtitle">{subtitle}</div>}
      </div>
      <nav className="sidebar-nav">
        {items.map((item) => {
          const isBack = item.id === 'back';
          return (
            <button
              key={item.id}
              className={`sidebar-item${activeItem === item.id ? ' active' : ''}${isBack ? ' back-item' : ''}`}
              onClick={() => onNavigate(item.id)}
            >
              <span className="sidebar-item-icon">{item.icon}</span>
              <span style={isBack ? { fontWeight: 800, letterSpacing: 0.3 } : undefined}>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        {userBadge && (
          <div style={{
            fontSize: 11, color: 'var(--sidebar-text-muted)', padding: '0 8px',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }} />
            {userBadge}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          {onChangePassword && (
            <button
              onClick={onChangePassword}
              className="sidebar-item"
              style={{ flex: 1, justifyContent: 'center', marginBottom: 0, padding: '9px 0' }}
              title="Change password"
            >
              <KeyRound size={16} />
            </button>
          )}
          <button
            onClick={onToggleTheme}
            className="sidebar-item"
            style={{ flex: 1, justifyContent: 'center', marginBottom: 0, padding: '9px 0' }}
            title={isDark ? 'Light mode' : 'Dark mode'}
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            onClick={onLogout}
            className="sidebar-item"
            style={{ flex: 1, justifyContent: 'center', marginBottom: 0, padding: '9px 0' }}
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
