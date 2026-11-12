import { ThemeId, getThemeDefinition } from '../types/theme';

const DYNAMIC_FONT_LINK_ID = 'quantporto-dynamic-theme-font';

/**
 * Dynamically loads the Google Fonts stylesheet for the active theme archetype.
 * Reuses or updates the dedicated <link> tag in <head>, preventing duplicate downloads.
 */
export function loadThemeFont(themeId: ThemeId): void {
  if (typeof document === 'undefined') return;

  const theme = getThemeDefinition(themeId);
  let fontLink = document.getElementById(DYNAMIC_FONT_LINK_ID) as HTMLLinkElement | null;

  if (!theme.googleFontsUrl) {
    // Theme relies entirely on native system fonts (e.g., Apple iOS HIG)
    if (fontLink) {
      fontLink.remove();
    }
    return;
  }

  if (!fontLink) {
    fontLink = document.createElement('link');
    fontLink.id = DYNAMIC_FONT_LINK_ID;
    fontLink.rel = 'stylesheet';
    document.head.appendChild(fontLink);
  }

  if (fontLink.href !== theme.googleFontsUrl) {
    fontLink.href = theme.googleFontsUrl;
  }
}
