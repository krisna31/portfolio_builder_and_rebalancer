/**
 * Theme Chart Colors Utility
 * Provides standardized CSS variable references and computed color getters
 * for Recharts, HTML Canvas, and SVG visualizations across all 8 design archetypes.
 */

export const THEME_CHART_VARIABLES = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
] as const;

export const THEME_COLOR_VARIABLES = {
  accentPrimary: 'var(--accent-primary)',
  accentHover: 'var(--accent-hover)',
  accentMuted: 'var(--accent-muted)',
  accentTint: 'var(--accent-tint)',
  canvas: 'var(--bg-canvas)',
  surface: 'var(--bg-surface)',
  card: 'var(--bg-card)',
  border: 'var(--border-default)',
  ink: 'var(--text-ink)',
  textMain: 'var(--text-main)',
  textMuted: 'var(--text-muted)',
  statusSuccess: 'var(--status-success)',
  statusDanger: 'var(--status-danger)',
  statusWarning: 'var(--status-warning)',
  statusInfo: 'var(--status-info)',
} as const;

/**
 * Returns an array of CSS variable expressions for sequential categorical series.
 * Supported natively by Recharts SVG elements (Bar, Line, Area, Cell, Scatter).
 */
export function getThemeChartPalette(): string[] {
  return [...THEME_CHART_VARIABLES];
}

/**
 * Resolves a CSS variable to an evaluated string in the DOM (e.g. for HTML Canvas rendering).
 * Falls back cleanly in SSR or test environments where window/document is undefined.
 */
export function getComputedThemeVariable(varName: string, fallback = ''): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return fallback;
  }
  try {
    const raw = varName.startsWith('var(')
      ? varName.slice(4, -1).trim()
      : varName;
    const value = window.getComputedStyle(document.documentElement).getPropertyValue(raw).trim();
    return value || fallback;
  } catch {
    return fallback;
  }
}
