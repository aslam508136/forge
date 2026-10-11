import { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export function LoadingOverlay({ message }: { message: string }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/90 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4">
        <Loader2 size={56} className="text-sky-400 animate-spin" />
        <p className="text-slate-100 text-lg font-medium">{message}</p>
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-gray-300 mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-700">{title}</h3>
      {subtitle && <p className="text-sm text-gray-500 mt-1 max-w-md">{subtitle}</p>}
    </div>
  );
}
