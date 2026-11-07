import { Sparkles } from 'lucide-react';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand ${compact ? 'brand-compact' : ''}`}>
      <span className="brand-mark" aria-hidden="true">G<Sparkles size={13} /></span>
      {!compact && <span className="brand-word">geemifi<span className="brand-period">.</span></span>}
    </span>
  );
}