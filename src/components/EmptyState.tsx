import type { LucideIcon } from 'lucide-react';

export function EmptyState({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-8 text-center">
      <span className="breathe flex h-12 w-12 items-center justify-center rounded-full border border-line-strong bg-tint text-ink-3">
        <Icon size={20} strokeWidth={1.5} />
      </span>
      <div className="text-sm text-ink-2">{title}</div>
      {hint && <div className="max-w-64 text-xs text-ink-3">{hint}</div>}
    </div>
  );
}
