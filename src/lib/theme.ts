import { useSyncExternalStore } from 'react';

export type ThemeId = 'ember' | 'frost' | 'dune';

// Mirrors the CSS variables; SVG attributes (recharts) can't read var().
export const THEMES: Record<ThemeId, { label: string; gain: string; loss: string; accent: string; ink: string; ink3: string; bar: string }> = {
  ember: { label: 'Ember', gain: '#3ddc97', loss: '#ff5a5f', accent: '#f26b1d', ink: '#f7ede8', ink3: '#78645e', bar: '#0b0608' },
  frost: { label: 'Frost', gain: '#12906a', loss: '#d1453f', accent: '#1a2123', ink: '#14191b', ink3: '#8f9a9f', bar: '#e4e8eb' },
  dune: { label: 'Dune', gain: '#3f8f4f', loss: '#b6403c', accent: '#2a130c', ink: '#2a170f', ink3: '#b39f95', bar: '#f5e9e4' },
};

const KEY = 'investja.theme';
const read = (): ThemeId => {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'ember' || v === 'frost' || v === 'dune') return v;
  } catch { /* storage blocked */ }
  return 'ember';
};

let current: ThemeId = read();
const subs = new Set<() => void>();

function apply() {
  document.documentElement.dataset.theme = current;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEMES[current].bar);
}

export function initTheme() { apply(); }

export function setTheme(t: ThemeId) {
  current = t;
  try { localStorage.setItem(KEY, t); } catch { /* storage blocked */ }
  apply();
  subs.forEach((f) => f());
}

export function useTheme() {
  const id = useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => current);
  return { id, colors: THEMES[id] };
}
