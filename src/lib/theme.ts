export interface Theme {
  bg: string; bgLight: string; frame: string; text: string; textMuted: string;
  accent: string; accentDark: string; success: string; successDark: string;
  danger: string; dangerDark: string; warning: string; warningDark: string;
  border: string; borderHover: string; cardBg: string; cardBorder: string; headerBg: string;
  inputBg: string; rowEven: string; rowOdd: string; isDark: boolean;
  glowPrimary: string; glowSuccess: string; glowDanger: string;
  glassBg: string; glassBorder: string; glassShadow: string;
  sidebarBg: string; sidebarText: string; sidebarTextMuted: string; sidebarActive: string; sidebarHover: string;
  accentText: string; modalShadow: string; cardHoverShadow: string;
  itemHover: string; itemActive: string; itemActiveBorder: string;
  gridLine: string; bgGlow: string; authPanel: string; overlay: string;
  glowRgb: string; scrollTrack: string; scrollThumb: string;
}

export const darkTheme: Theme = {
  bg: '#05080f', bgLight: '#0a1222', frame: '#0f1a2e', text: '#e0e8f0', textMuted: 'rgba(120,150,190,0.7)',
  accent: '#00d4ff', accentDark: '#0099cc', success: '#00e676', successDark: '#00c853',
  danger: '#ff1744', dangerDark: '#d50000', warning: '#ffab00', warningDark: '#ff8f00',
  border: 'rgba(0,180,255,0.12)', borderHover: 'rgba(0,212,255,0.4)',
  cardBg: 'rgba(10,16,30,0.7)', cardBorder: 'rgba(0,212,255,0.12)',
  headerBg: 'rgba(10,16,30,0.8)', inputBg: 'rgba(10,18,34,0.8)',
  rowEven: 'rgba(0,212,255,0.02)', rowOdd: 'transparent', isDark: true,
  glowPrimary: '0 0 20px rgba(0,212,255,0.3)',
  glowSuccess: '0 0 20px rgba(0,230,118,0.3)',
  glowDanger: '0 0 20px rgba(255,23,68,0.3)',
  glassBg: 'rgba(10,16,30,0.7)',
  glassBorder: 'rgba(0,212,255,0.12)',
  glassShadow: '0 8px 32px rgba(0,0,0,0.4)',
  sidebarBg: 'rgba(8,14,26,0.92)',
  sidebarText: '#e0e8f0',
  sidebarTextMuted: 'rgba(120,150,190,0.7)',
  sidebarActive: '#00d4ff',
  sidebarHover: 'rgba(0,212,255,0.06)',
  accentText: '#001a24',
  modalShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(0,212,255,0.05)',
  cardHoverShadow: '0 8px 40px rgba(0,0,0,0.5), 0 0 30px rgba(0,212,255,0.05)',
  itemHover: 'rgba(0,212,255,0.06)',
  itemActive: 'rgba(0,212,255,0.1)',
  itemActiveBorder: 'rgba(0,212,255,0.15)',
  gridLine: 'rgba(0,212,255,0.03)',
  bgGlow: 'rgba(0,212,255,0.04)',
  authPanel: 'rgba(8,14,26,0.6)',
  overlay: 'rgba(0,0,0,0.8)',
  glowRgb: '0, 212, 255',
  scrollTrack: 'rgba(0,0,0,0.2)',
  scrollThumb: 'rgba(0,212,255,0.2)',
};

export const lightTheme: Theme = {
  bg: '#f5f7fa',
  bgLight: '#ffffff', frame: '#eef1f5', text: '#0f172a', textMuted: '#64748b',
  accent: '#2563eb', accentDark: '#1d4ed8', success: '#1d8102', successDark: '#167000',
  danger: '#d13212', dangerDark: '#b52a0f', warning: '#b45309', warningDark: '#92400e',
  border: '#e2e8f0', borderHover: '#3b82f6',
  cardBg: '#ffffff', cardBorder: '#e2e8f0',
  headerBg: '#ffffff', inputBg: '#ffffff',
  rowEven: '#f8fafc', rowOdd: '#ffffff', isDark: false,
  glowPrimary: '0 4px 14px rgba(37,99,235,0.22)',
  glowSuccess: '0 4px 14px rgba(29,129,2,0.18)',
  glowDanger: '0 4px 14px rgba(209,50,18,0.18)',
  glassBg: 'rgba(255,255,255,0.92)',
  glassBorder: '#e2e8f0',
  glassShadow: '0 1px 3px rgba(15,23,42,0.06), 0 4px 14px rgba(15,23,42,0.05)',
  sidebarBg: '#ffffff',
  sidebarText: '#0f172a',
  sidebarTextMuted: '#475569',
  sidebarActive: '#2563eb',
  sidebarHover: 'rgba(37,99,235,0.08)',
  accentText: '#ffffff',
  modalShadow: '0 12px 32px rgba(15,23,42,0.16)',
  cardHoverShadow: '0 8px 24px rgba(15,23,42,0.10), 0 0 24px rgba(37,99,235,0.06)',
  itemHover: '#f1f5f9',
  itemActive: '#eff6ff',
  itemActiveBorder: '#bfdbfe',
  gridLine: 'rgba(15,23,42,0.04)',
  bgGlow: 'rgba(37,99,235,0.05)',
  authPanel: '#ffffff',
  overlay: 'rgba(15,23,42,0.45)',
  glowRgb: '37, 99, 235',
  scrollTrack: 'rgba(15,23,42,0.07)',
  scrollThumb: 'rgba(15,23,42,0.25)',
};
