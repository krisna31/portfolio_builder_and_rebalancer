import { useCallback, useEffect, useState } from 'react';
import { ThemeId, DEFAULT_THEME_ID, getThemeDefinition, THEME_REGISTRY } from '../types/theme';
import { loadThemeFont } from '../lib/themeFontLoader';

const THEME_STORAGE_KEY = 'quantporto-theme-id';
const COLOR_SCHEME_STORAGE_KEY = 'color-scheme';

export function getInitialThemeId(): ThemeId {
  if (typeof window === 'undefined') return DEFAULT_THEME_ID;
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemeId | null;
    if (saved && saved in THEME_REGISTRY) {
      return saved;
    }
  } catch {
    // Ignore localStorage access failures
  }
  return DEFAULT_THEME_ID;
}

export function getInitialColorScheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = localStorage.getItem(COLOR_SCHEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
    const meta = document.querySelector('meta[name="color-scheme"]')?.getAttribute('content');
    if (meta === 'light' || meta === 'dark') {
      return meta;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export interface UseThemeManagerResult {
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
  colorScheme: 'light' | 'dark';
  setColorScheme: (scheme: 'light' | 'dark') => void;
  toggleColorScheme: () => void;
}

export function useThemeManager(): UseThemeManagerResult {
  const [themeId, setThemeIdState] = useState<ThemeId>(getInitialThemeId);
  const [colorScheme, setColorSchemeState] = useState<'light' | 'dark'>(getInitialColorScheme);

  // Synchronize DOM attributes and localStorage whenever themeId or colorScheme changes
  const applyThemeToDom = useCallback((activeTheme: ThemeId, activeScheme: 'light' | 'dark') => {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    root.setAttribute('data-theme', activeTheme);
    root.setAttribute('data-mode', activeScheme);
    root.classList.toggle('dark', activeScheme === 'dark');

    // Update PWA theme-color meta tag
    const def = getThemeDefinition(activeTheme);
    const themeColor = activeScheme === 'dark' ? def.darkAccent : def.lightAccent;
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', themeColor);
    }

    const metaColorScheme = document.querySelector('meta[name="color-scheme"]');
    if (metaColorScheme) {
      metaColorScheme.setAttribute('content', activeScheme);
    }

    // Load active theme fonts
    loadThemeFont(activeTheme);
  }, []);

  const setThemeId = useCallback(
    (newThemeId: ThemeId) => {
      setThemeIdState(newThemeId);
      try {
        localStorage.setItem(THEME_STORAGE_KEY, newThemeId);
      } catch {
        // Ignore storage exceptions
      }
      applyThemeToDom(newThemeId, colorScheme);
    },
    [colorScheme, applyThemeToDom]
  );

  const setColorScheme = useCallback(
    (newScheme: 'light' | 'dark') => {
      setColorSchemeState(newScheme);
      try {
        localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, newScheme);
      } catch {
        // Ignore storage exceptions
      }
      applyThemeToDom(themeId, newScheme);
    },
    [themeId, applyThemeToDom]
  );

  const toggleColorScheme = useCallback(() => {
    const nextScheme: 'light' | 'dark' = colorScheme === 'dark' ? 'light' : 'dark';
    setColorScheme(nextScheme);
  }, [colorScheme, setColorScheme]);

  // Initial sync on mount and listen to OS preference changes
  useEffect(() => {
    applyThemeToDom(themeId, colorScheme);

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMediaChange = (e: MediaQueryListEvent) => {
      try {
        const saved = localStorage.getItem(COLOR_SCHEME_STORAGE_KEY);
        // Only adapt to OS if user has no explicit stored preference
        if (!saved) {
          const newScheme = e.matches ? 'dark' : 'light';
          setColorSchemeState(newScheme);
          applyThemeToDom(themeId, newScheme);
        }
      } catch {
        // Ignore
      }
    };

    mql.addEventListener('change', handleMediaChange);
    return () => mql.removeEventListener('change', handleMediaChange);
  }, [themeId, colorScheme, applyThemeToDom]);

  return {
    themeId,
    setThemeId,
    colorScheme,
    setColorScheme,
    toggleColorScheme,
  };
}
