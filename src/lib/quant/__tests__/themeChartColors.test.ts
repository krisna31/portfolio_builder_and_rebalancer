import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  THEME_CHART_VARIABLES,
  THEME_COLOR_VARIABLES,
  getThemeChartPalette,
  getComputedThemeVariable,
} from '../themeChartColors';

describe('themeChartColors utility', () => {
  it('exports 6 standardized chart variables', () => {
    expect(THEME_CHART_VARIABLES).toHaveLength(6);
    expect(THEME_CHART_VARIABLES[0]).toBe('var(--chart-1)');
    expect(THEME_CHART_VARIABLES[5]).toBe('var(--chart-6)');
  });

  it('getThemeChartPalette returns array matching THEME_CHART_VARIABLES', () => {
    const palette = getThemeChartPalette();
    expect(palette).toEqual([
      'var(--chart-1)',
      'var(--chart-2)',
      'var(--chart-3)',
      'var(--chart-4)',
      'var(--chart-5)',
      'var(--chart-6)',
    ]);
  });

  it('exports semantic color variables for design tokens', () => {
    expect(THEME_COLOR_VARIABLES.accentPrimary).toBe('var(--accent-primary)');
    expect(THEME_COLOR_VARIABLES.canvas).toBe('var(--bg-canvas)');
    expect(THEME_COLOR_VARIABLES.surface).toBe('var(--bg-surface)');
    expect(THEME_COLOR_VARIABLES.statusSuccess).toBe('var(--status-success)');
    expect(THEME_COLOR_VARIABLES.statusDanger).toBe('var(--status-danger)');
  });

  describe('getComputedThemeVariable', () => {
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;

    afterEach(() => {
      // Restore globals
      if (originalWindow !== undefined) {
        globalThis.window = originalWindow;
      } else {
        delete (globalThis as { window?: unknown }).window;
      }
      if (originalDocument !== undefined) {
        globalThis.document = originalDocument;
      } else {
        delete (globalThis as { document?: unknown }).document;
      }
    });

    it('returns fallback in non-browser environment when window or document is missing', () => {
      delete (globalThis as { window?: unknown }).window;
      delete (globalThis as { document?: unknown }).document;

      const result = getComputedThemeVariable('--accent-primary', '#21543D');
      expect(result).toBe('#21543D');
    });

    it('reads computed style property from document.documentElement when window exists', () => {
      const mockGetPropertyValue = vi.fn((prop: string) => {
        if (prop === '--accent-primary') return '#00E5FF';
        return '';
      });

      const mockDocument = {
        documentElement: {},
      };

      const mockWindow = {
        getComputedStyle: vi.fn(() => ({
          getPropertyValue: mockGetPropertyValue,
        })),
      };

      globalThis.window = mockWindow as unknown as Window & typeof globalThis;
      globalThis.document = mockDocument as unknown as Document;

      const val1 = getComputedThemeVariable('--accent-primary', '#000000');
      expect(val1).toBe('#00E5FF');
      expect(mockGetPropertyValue).toHaveBeenCalledWith('--accent-primary');

      // Test strip var(--...) wrapping
      const val2 = getComputedThemeVariable('var(--accent-primary)', '#000000');
      expect(val2).toBe('#00E5FF');

      // Test fallback if property is empty
      const val3 = getComputedThemeVariable('--non-existent', '#fallback');
      expect(val3).toBe('#fallback');
    });
  });
});
