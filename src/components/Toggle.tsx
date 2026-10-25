import { motion } from 'framer-motion';

export function Toggle<T extends string>({ value, options, onChange, id }: {
  value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; id: string;
}) {
  return (
    <div className="relative flex rounded-full border border-line-strong bg-tint p-0.5">
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)} className={`num relative z-10 rounded-full px-3 py-1 text-xs transition-colors ${value === o.id ? 'text-ink' : 'text-ink-3 hover:text-ink'}`}>
          {value === o.id && <motion.span layoutId={`tg-${id}`} className="absolute inset-0 -z-10 rounded-full bg-tint-2" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}
