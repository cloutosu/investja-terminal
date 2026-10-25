const usd = (decimals: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
const f2 = usd(2);
const f0 = usd(0);

export const money = (n: number, decimals = 2) => `${n < 0 ? '-' : ''}$${(decimals === 0 ? f0 : f2).format(Math.abs(n))}`;
export const signedMoney = (n: number, decimals = 2) => `${n < 0 ? '-' : '+'}${money(Math.abs(n), decimals)}`;
export const signedPct = (n: number) => `${n < 0 ? '-' : '+'}${Math.abs(n).toFixed(1)}%`;
export const int = (n: number) => f0.format(n);
export const deltaDecimals = (n: number) => (Math.abs(n) >= 1000 ? 0 : 2);

export const tone = (n: number) => (n > 0 ? 'text-gain' : n < 0 ? 'text-loss' : 'text-ink-3');
