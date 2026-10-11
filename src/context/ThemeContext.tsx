import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { darkTheme, lightTheme, Theme } from '../lib/theme';

interface ThemeContextValue { theme: Theme; isDark: boolean; toggleTheme: () => void; }
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.style.setProperty('--bg', theme.bg);
  root.style.setProperty('--bg-card', theme.cardBg);
  root.style.setProperty('--bg-elevated', theme.frame);
  root.style.setProperty('--border', theme.border);
  root.style.setProperty('--border-hover', theme.borderHover);
  root.style.setProperty('--text', theme.text);
  root.style.setProperty('--text-muted', theme.textMuted);
  root.style.setProperty('--primary', theme.accent);
  root.style.setProperty('--primary-hover', theme.accentDark);
  root.style.setProperty('--primary-dark', theme.accentDark);
  root.style.setProperty('--success', theme.success);
  root.style.setProperty('--warning', theme.warning);
  root.style.setProperty('--danger', theme.danger);
  root.style.setProperty('--info', theme.accent);
  root.style.setProperty('--glow-primary', theme.glowPrimary);
  root.style.setProperty('--glow-success', theme.glowSuccess);
  root.style.setProperty('--glow-danger', theme.glowDanger);
  root.style.setProperty('--glass-bg', theme.glassBg);
  root.style.setProperty('--glass-border', theme.glassBorder);
  root.style.setProperty('--glass-shadow', theme.glassShadow);
  root.style.setProperty('--input-bg', theme.inputBg);
  root.style.setProperty('--bg-light', theme.bgLight);
  root.style.setProperty('--sidebar-bg', theme.sidebarBg);
  root.style.setProperty('--sidebar-text', theme.sidebarText);
  root.style.setProperty('--sidebar-text-muted', theme.sidebarTextMuted);
  root.style.setProperty('--sidebar-active', theme.sidebarActive);
  root.style.setProperty('--sidebar-hover', theme.sidebarHover);
  root.style.setProperty('--btn-contrast', theme.accentText);
  root.style.setProperty('--modal-shadow', theme.modalShadow);
  root.style.setProperty('--card-hover-shadow', theme.cardHoverShadow);
  root.style.setProperty('--item-hover', theme.itemHover);
  root.style.setProperty('--item-active', theme.itemActive);
  root.style.setProperty('--item-active-border', theme.itemActiveBorder);
  root.style.setProperty('--grid-line', theme.gridLine);
  root.style.setProperty('--bg-glow', theme.bgGlow);
  root.style.setProperty('--auth-panel', theme.authPanel);
  root.style.setProperty('--modal-overlay', theme.overlay);
  root.style.setProperty('--glow-rgb', theme.glowRgb);
  root.style.setProperty('--scroll-track', theme.scrollTrack);
  root.style.setProperty('--scroll-thumb', theme.scrollThumb);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(true);
  const theme = isDark ? darkTheme : lightTheme;

  useEffect(() => { applyTheme(theme); }, [theme]);

  const toggleTheme = useCallback(() => setIsDark((d) => !d), []);
  return <ThemeContext.Provider value={{ theme, isDark, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
