/**
 * Formatting helpers for Indonesian Rupiah (IDR), USD, percentages, and URL hash state persistence.
 */

export function formatIdr(amount: number, compact: boolean = false): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';

  if (compact) {
    if (abs >= 1_000_000_000_000) {
      return `${sign}Rp ${(abs / 1_000_000_000_000).toFixed(2)} T`;
    }
    if (abs >= 1_000_000_000) {
      return `${sign}Rp ${(abs / 1_000_000_000).toFixed(2)} M`;
    }
    if (abs >= 1_000_000) {
      return `${sign}Rp ${(abs / 1_000_000).toFixed(1)} Jt`;
    }
    if (abs >= 1_000) {
      return `${sign}Rp ${(abs / 1_000).toFixed(0)} Rb`;
    }
  }

  return `${sign}Rp ${Math.round(abs).toLocaleString('id-ID')}`;
}

export function formatUsd(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  return `${sign}$${abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPercent(val: number, decimals: number = 2): string {
  return `${val.toFixed(decimals)}%`;
}

export function getRiskTierBadge(tier: 'super-high' | 'high' | 'medium' | 'low'): {
  label: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
} {
  switch (tier) {
    case 'super-high':
      return {
        label: 'SUPER HIGH RISK',
        bgClass: 'bg-rose-500/10',
        textClass: 'text-rose-600 dark:text-rose-400',
        borderClass: 'border-rose-500/30',
      };
    case 'high':
      return {
        label: 'HIGH RISK',
        bgClass: 'bg-amber-500/10',
        textClass: 'text-amber-700 dark:text-amber-400',
        borderClass: 'border-amber-500/30',
      };
    case 'medium':
      return {
        label: 'MEDIUM RISK',
        bgClass: 'bg-emerald-500/10',
        textClass: 'text-emerald-700 dark:text-emerald-400',
        borderClass: 'border-emerald-500/30',
      };
    case 'low':
      return {
        label: 'LOW RISK',
        bgClass: 'bg-sky-500/10',
        textClass: 'text-sky-700 dark:text-sky-400',
        borderClass: 'border-sky-500/30',
      };
  }
}
