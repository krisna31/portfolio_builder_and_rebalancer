export type ThemeId =
  | 'mineral-botanical'
  | 'honkai-valkyrie'
  | 'zenless-urban'
  | 'werkbund-brutalist'
  | 'retro-amber-crt'
  | 'android-material'
  | 'ios-system'
  | 'pure-monolith';

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  archetype: string;
  badge: string;
  lightAccent: string;
  darkAccent: string;
  lightBg: string;
  darkBg: string;
  displayFont: string;
  sansFont: string;
  monoFont: string;
  googleFontsUrl?: string;
  description: string;
}

export const DEFAULT_THEME_ID: ThemeId = 'mineral-botanical';

export const THEME_REGISTRY: Record<ThemeId, ThemeDefinition> = {
  'mineral-botanical': {
    id: 'mineral-botanical',
    name: 'Limestone & Moss',
    archetype: 'Mineral & Botanical',
    badge: 'Classic',
    lightAccent: '#21543D',
    darkAccent: '#68B68E',
    lightBg: '#F1F0EA',
    darkBg: '#111613',
    displayFont: 'Fraunces',
    sansFont: 'Plus Jakarta Sans',
    monoFont: 'DM Mono',
    googleFontsUrl:
      'https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,400&family=Fraunces:ital,opsz,wght,SOFT,WONK@0,9..144,100..900,0..100,0..1;1,9..144,100..900,0..100,0..1&family=Plus+Jakarta+Sans:ital,wght@0,200..800;1,200..800&display=swap',
    description: 'Aesop architectural spaces, Muji materiality, unglazed ceramic stoneware.',
  },
  'honkai-valkyrie': {
    id: 'honkai-valkyrie',
    name: 'Hyperion Valkyrie',
    archetype: 'Tactical Sci-Fi HUD',
    badge: 'Sci-Fi',
    lightAccent: '#006E8C',
    darkAccent: '#00E5FF',
    lightBg: '#F0F4F8',
    darkBg: '#080C14',
    displayFont: 'Chakra Petch',
    sansFont: 'IBM Plex Sans',
    monoFont: 'JetBrains Mono',
    googleFontsUrl:
      'https://fonts.googleapis.com/css2?family=Chakra+Petch:ital,wght@0,400;0,600;0,700;1,400&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=JetBrains+Mono:ital,wght@0,400;0,500;0,600;1,400&display=swap',
    description: 'Honkai battleship bridge consoles, Schicksal tactical HUDs, mecha telemetry.',
  },
  'zenless-urban': {
    id: 'zenless-urban',
    name: 'New Eridu Urban',
    archetype: 'Urban Street Skate',
    badge: 'Arcade',
    lightAccent: '#8F6B00',
    darkAccent: '#FFE600',
    lightBg: '#F4F4F0',
    darkBg: '#0D0E11',
    displayFont: 'Syne',
    sansFont: 'Plus Jakarta Sans',
    monoFont: 'Space Mono',
    googleFontsUrl:
      'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Space+Mono:ital,wght@0,400;0,700;1,400&family=Syne:wght@700;800&display=swap',
    description: 'Sixth Street skate culture, CRT monitors, video tape cassettes, hazard yellow.',
  },
  'werkbund-brutalist': {
    id: 'werkbund-brutalist',
    name: 'Werkbund Grid',
    archetype: 'Bauhaus / Vignelli',
    badge: 'Swiss',
    lightAccent: '#0033EE',
    darkAccent: '#5C85FF',
    lightBg: '#F7F7F5',
    darkBg: '#0A0A0A',
    displayFont: 'Bricolage Grotesque',
    sansFont: 'Public Sans',
    monoFont: 'Space Mono',
    googleFontsUrl:
      'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,200..800&family=Public+Sans:ital,wght@0,100..900;1,100..900&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap',
    description: 'Massimo Vignelli wayfinding, exposed shared-border architectural grids, Ultramarine.',
  },
  'retro-amber-crt': {
    id: 'retro-amber-crt',
    name: 'Retro Amber CRT',
    archetype: 'DEC VT220 Terminal',
    badge: 'Retro',
    lightAccent: '#A75900',
    darkAccent: '#FFB000',
    lightBg: '#F5EFE6',
    darkBg: '#07080A',
    displayFont: 'JetBrains Mono',
    sansFont: 'IBM Plex Mono',
    monoFont: 'JetBrains Mono',
    googleFontsUrl:
      'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;1,400&family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&display=swap',
    description: '1980s amber phosphor cathode-ray terminals and continuous-feed computer stationery.',
  },
  'android-material': {
    id: 'android-material',
    name: 'Material 3',
    archetype: 'Google Material You',
    badge: 'Android',
    lightAccent: '#0056D2',
    darkAccent: '#7CACF8',
    lightBg: '#F8F9FA',
    darkBg: '#111315',
    displayFont: 'Roboto Flex',
    sansFont: 'Roboto Flex',
    monoFont: 'Roboto Mono',
    googleFontsUrl:
      'https://fonts.googleapis.com/css2?family=Roboto+Flex:wght@100..1000&family=Roboto+Mono:ital,wght@0,400;0,500;0,600;1,400&display=swap',
    description: 'Tonal surface elevation, dynamic Cobalt Sapphire, 48px touch floors.',
  },
  'ios-system': {
    id: 'ios-system',
    name: 'Apple iOS HIG',
    archetype: 'Apple HIG System',
    badge: 'Apple',
    lightAccent: '#0055D6',
    darkAccent: '#479EFF',
    lightBg: '#F2F2F7',
    darkBg: '#0A0A0C',
    displayFont: 'SF Pro Display',
    sansFont: 'SF Pro Text',
    monoFont: 'SF Mono',
    // Uses native system fonts; zero external network overhead
    googleFontsUrl: undefined,
    description: 'Inset grouped backgrounds, Apple System Blue, continuous squircles, frosted translucency.',
  },
  'pure-monolith': {
    id: 'pure-monolith',
    name: 'Pure Monolith',
    archetype: 'Swiss Brutalism',
    badge: 'Mono',
    lightAccent: '#000000',
    darkAccent: '#FFFFFF',
    lightBg: '#FFFFFF',
    darkBg: '#050505',
    displayFont: 'Inter',
    sansFont: 'Inter',
    monoFont: 'Space Mono',
    googleFontsUrl:
      'https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Space+Mono:ital,wght@0,400;0,700;1,400;1,700&display=swap',
    description: 'Zero compromise black & white stark minimalism, 0px razor geometry, Inter Variable.',
  },
};

export const ALL_THEME_IDS: ThemeId[] = [
  'mineral-botanical',
  'honkai-valkyrie',
  'zenless-urban',
  'werkbund-brutalist',
  'retro-amber-crt',
  'android-material',
  'ios-system',
  'pure-monolith',
];

export function getThemeDefinition(id: ThemeId): ThemeDefinition {
  return THEME_REGISTRY[id] || THEME_REGISTRY[DEFAULT_THEME_ID];
}
