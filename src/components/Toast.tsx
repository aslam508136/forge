import { useToast } from '../context/ToastContext';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const icons = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info };
const colors = { success: 'bg-emerald-600', error: 'bg-rose-600', warning: 'bg-amber-500', info: 'bg-sky-600' };

export function ToastContainer() {
  const { toasts, dismissToast } = useToast();
  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 w-96 max-w-[calc(100vw-3rem)]">
      {toasts.map((t) => {
        const Icon = icons[t.type];
        return (
          <div key={t.id} className={`${colors[t.type]} text-white rounded-xl shadow-2xl flex items-center gap-3 px-5 py-4 border border-white/15`} style={{ animation: 'toastSlideIn 0.35s cubic-bezier(0.22, 1, 0.36, 1)', textShadow: '0 0 8px rgba(255,255,255,0.2)' }}>
            <Icon size={22} className="shrink-0" />
            <span className="text-sm font-semibold flex-1 leading-snug">{t.message}</span>
            <button onClick={() => dismissToast(t.id)} className="shrink-0 opacity-70 hover:opacity-100 transition-opacity"><X size={18} /></button>
          </div>
        );
      })}
    </div>
  );
}
