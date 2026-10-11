export default function MadeByBadge() {
  return (
    <div style={{
      position: 'fixed',
      top: 14,
      right: 18,
      zIndex: 9999,
      fontSize: 12,
      fontWeight: 700,
      color: 'rgba(var(--glow-rgb), 0.9)',
      background: 'rgba(var(--glow-rgb), 0.08)',
      border: '1px solid rgba(var(--glow-rgb), 0.2)',
      borderRadius: 999,
      padding: '6px 16px',
      pointerEvents: 'none',
      letterSpacing: 0.5,
      backdropFilter: 'blur(10px)',
      textTransform: 'uppercase',
      animation: 'bulbGlow 2s ease-in-out infinite',
    }}>
      ✦ Made by Ajay
    </div>
  );
}
