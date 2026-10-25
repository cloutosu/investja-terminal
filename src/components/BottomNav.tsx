import { motion } from 'framer-motion';
import { Clock, House, Lock, Trophy } from 'lucide-react';

export type Tab = 'home' | 'board' | 'report';
interface Props { tab: Tab; onTab: (t: Tab) => void; onLock: () => void }

const items: { id: Tab; icon: typeof House; label: string }[] = [
  { id: 'home', icon: House, label: 'Home' },
  { id: 'board', icon: Trophy, label: 'Rankings' },
  { id: 'report', icon: Clock, label: 'Report' },
];

export function BottomNav({ tab, onTab, onLock }: Props) {
  return (
    <nav
      className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-xs items-center justify-between rounded-full border border-line-strong bg-elevated/85 px-3 py-2 shadow-xl shadow-black/30 backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
    >
      {items.map((it) => (
        <button key={it.id} onClick={() => onTab(it.id)} aria-label={it.label} className="relative flex h-12 w-12 items-center justify-center rounded-full">
          {tab === it.id && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-tint-2" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
          <it.icon size={20} className={`relative ${tab === it.id ? 'text-ink' : 'text-ink-3'}`} />
        </button>
      ))}
      <button onClick={onLock} aria-label="Lock terminal" className="flex h-12 w-12 items-center justify-center rounded-full"><Lock size={19} className="text-ink-3" /></button>
    </nav>
  );
}
