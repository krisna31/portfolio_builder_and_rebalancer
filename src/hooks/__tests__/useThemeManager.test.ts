import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getInitialThemeId, getInitialColorScheme } from '../useThemeManager';
import { ALL_THEME_IDS, THEME_REGISTRY, DEFAULT_THEME_ID, getThemeDefinition } from '../../types/theme';
import { loadThemeFont } from '../../lib/themeFontLoader';

const createMockStorage = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

const mockLocalStorage = createMockStorage();
Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

// Setup minimal document mock for Node test environment
const mockHeadChildren: Array<{ id: string; rel: string; href?: string; remove: () => void }> = [];
const mockDocument = {
  head: {
    appendChild: (elem: any) => {
      mockHeadChildren.push(elem);
      return elem;
    },
  },
  getElementById: (id: string) => {
    return mockHeadChildren.find((el) => el.id === id) ?? null;
  },
  createElement: (tagName: string) => {
    const el: any = {
      tagName,
      id: '',
      rel: '',
      href: '',
      remove: () => {
        const idx = mockHeadChildren.indexOf(el);
        if (idx >= 0) mockHeadChildren.splice(idx, 1);
      },
    };
    return el;
  },
  documentElement: {
    className: '',
    setAttribute: vi.fn(),
    removeAttribute: vi.fn(),
    getAttribute: vi.fn(),
    classList: {
      toggle: vi.fn(),
      contains: vi.fn(),
    },
  },
  querySelector: vi.fn(),
};

Object.defineProperty(globalThis, 'document', {
  value: mockDocument,
  writable: true,
});

Object.defineProperty(globalThis, 'window', {
  value: {
    matchMedia: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  },
  writable: true,
});

describe('Theme Engine & Registry', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    mockHeadChildren.length = 0;
    vi.restoreAllMocks();
  });

  it('contains exactly 8 registered design archetypes', () => {
    expect(ALL_THEME_IDS).toHaveLength(8);
    expect(ALL_THEME_IDS).toContain('mineral-botanical');
    expect(ALL_THEME_IDS).toContain('honkai-valkyrie');
    expect(ALL_THEME_IDS).toContain('zenless-urban');
    expect(ALL_THEME_IDS).toContain('werkbund-brutalist');
    expect(ALL_THEME_IDS).toContain('retro-amber-crt');
    expect(ALL_THEME_IDS).toContain('android-material');
    expect(ALL_THEME_IDS).toContain('ios-system');
    expect(ALL_THEME_IDS).toContain('pure-monolith');
  });

  it('each theme definition has valid metadata and WCAG hex colors', () => {
    for (const id of ALL_THEME_IDS) {
      const def = THEME_REGISTRY[id];
      expect(def).toBeDefined();
      expect(def.id).toBe(id);
      expect(def.name).toBeTruthy();
      expect(def.archetype).toBeTruthy();
      expect(def.badge).toBeTruthy();
      expect(def.lightAccent).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(def.darkAccent).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(def.lightBg).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(def.darkBg).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(def.displayFont).toBeTruthy();
      expect(def.sansFont).toBeTruthy();
      expect(def.monoFont).toBeTruthy();
    }
  });

  it('getThemeDefinition returns default theme for invalid ID', () => {
    // @ts-expect-error Testing invalid runtime ID
    const def = getThemeDefinition('non-existent-theme');
    expect(def.id).toBe(DEFAULT_THEME_ID);
  });

  it('getInitialThemeId defaults to mineral-botanical if nothing in localStorage', () => {
    expect(getInitialThemeId()).toBe('mineral-botanical');
  });

  it('getInitialThemeId recovers saved theme from localStorage', () => {
    mockLocalStorage.setItem('quantporto-theme-id', 'honkai-valkyrie');
    expect(getInitialThemeId()).toBe('honkai-valkyrie');
  });

  it('getInitialColorScheme falls back to light or system preference', () => {
    mockLocalStorage.setItem('color-scheme', 'dark');
    expect(getInitialColorScheme()).toBe('dark');

    mockLocalStorage.setItem('color-scheme', 'light');
    expect(getInitialColorScheme()).toBe('light');
  });

  it('loadThemeFont dynamically injects link tag for web fonts', () => {
    loadThemeFont('honkai-valkyrie');
    const link = document.getElementById('quantporto-dynamic-theme-font') as any;
    expect(link).not.toBeNull();
    expect(link?.rel).toBe('stylesheet');
    expect(link?.href).toContain('Chakra+Petch');
  });

  it('loadThemeFont skips external font download for system font themes', () => {
    loadThemeFont('zenless-urban');
    expect(document.getElementById('quantporto-dynamic-theme-font')).not.toBeNull();

    // ios-system uses native SF Pro and sets googleFontsUrl to undefined
    loadThemeFont('ios-system');
    expect(document.getElementById('quantporto-dynamic-theme-font')).toBeNull();
  });
});
