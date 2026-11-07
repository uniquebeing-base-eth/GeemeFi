import { Sparkles } from 'lucide-react';

type Props = { name: string; src?: string | null; size?: 'small' | 'medium' | 'large' };

export function Avatar({ name, src, size = 'medium' }: Props) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'G';
  return (
    <span className={`avatar avatar-${size}`} aria-label={name}>
      {src ? <img src={src} alt="" /> : <><Sparkles size={size === 'small' ? 12 : 15} /><b>{initials}</b></>}
    </span>
  );
}