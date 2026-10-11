import { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'success' | 'danger' | 'warning' | 'gray' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant; size?: Size; icon?: ReactNode; children?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary: 'bg-blue-600 hover:bg-blue-500 text-white',
  success: 'bg-emerald-600 hover:bg-emerald-500 text-white',
  danger: 'bg-rose-600 hover:bg-rose-500 text-white',
  warning: 'bg-amber-500 hover:bg-amber-400 text-white',
  gray: 'bg-gray-500 hover:bg-gray-400 text-white',
  ghost: 'bg-transparent hover:bg-black/10 text-current border border-gray-300',
};
const sizes: Record<Size, string> = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-6 py-3 text-base' };

export function Button({ variant = 'primary', size = 'md', icon, children, className = '', ...rest }: Props) {
  return (
    <button className={`inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-all duration-150 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`} {...rest}>
      {icon}{children}
    </button>
  );
}
