/**
 * Design tokens ported from docs/DESIGN_SYSTEM.md sections 2-4.
 * Ink on warm paper, one vermilion accent, hairlines instead of cards.
 */

export type ColorTokens = {
  paper: string;
  surface: string;
  surfaceSunken: string;
  ink: string;
  inkMuted: string;
  inkFaint: string;
  rule: string;
  ruleStrong: string;
  ruleInput: string;
  accent: string;
  accentInk: string;
  accentSoft: string;
  success: string;
  warning: string;
  danger: string;
};

export const lightColors: ColorTokens = {
  paper: '#F7F5F0',
  surface: '#FFFFFF',
  surfaceSunken: '#EFECE5',
  ink: '#1B1A17',
  inkMuted: '#5E5A52',
  inkFaint: '#8A857B',
  rule: '#E2DED4',
  ruleStrong: '#CBC6BA',
  ruleInput: '#857F74',
  accent: '#C2401C',
  accentInk: '#FFFFFF',
  accentSoft: '#F5E2DA',
  success: '#2F6B43',
  warning: '#8F5A0B',
  danger: '#B0261B',
};

export const darkColors: ColorTokens = {
  paper: '#131311',
  surface: '#1B1A18',
  surfaceSunken: '#0E0E0D',
  ink: '#EEEBE4',
  inkMuted: '#A6A196',
  inkFaint: '#78746B',
  rule: '#2C2A26',
  ruleStrong: '#3D3A35',
  ruleInput: '#77726A',
  accent: '#EB6A45',
  accentInk: '#1B0B05',
  accentSoft: '#3A1E15',
  success: '#6FBF8A',
  warning: '#E0A64A',
  danger: '#F07A6E',
};

/** 4pt scale: space[1] = 4. */
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  12: 48,
  16: 64,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  full: 999,
} as const;

/** Minimum touch target in points. */
export const MIN_TOUCH = 44;
/** Text is never smaller than this. */
export const MIN_FONT_SIZE = 12;

export const fontFamily = {
  display: 'Fraunces_600SemiBold',
  displayRegular: 'Fraunces_400Regular',
  ui: 'Inter_400Regular',
  uiMedium: 'Inter_500Medium',
  uiSemibold: 'Inter_600SemiBold',
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 22,
  '2xl': 28,
  '3xl': 36,
  '4xl': 48,
} as const;

export type TextVariant = 'display' | 'title' | 'heading' | 'body' | 'meta';

export type TextStyleToken = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
};

export const typeScale: Record<TextVariant, TextStyleToken> = {
  display: { fontFamily: fontFamily.display, fontSize: fontSize['3xl'], lineHeight: 42 },
  title: { fontFamily: fontFamily.display, fontSize: fontSize['2xl'], lineHeight: 34 },
  heading: { fontFamily: fontFamily.display, fontSize: fontSize.xl, lineHeight: 28 },
  body: { fontFamily: fontFamily.ui, fontSize: fontSize.base, lineHeight: 25 },
  meta: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, lineHeight: 20 },
};

export type Theme = {
  scheme: 'light' | 'dark';
  colors: ColorTokens;
  space: typeof space;
  radius: typeof radius;
  fontFamily: typeof fontFamily;
  fontSize: typeof fontSize;
  typeScale: typeof typeScale;
};

export const lightTheme: Theme = { scheme: 'light', colors: lightColors, space, radius, fontFamily, fontSize, typeScale };
export const darkTheme: Theme = { scheme: 'dark', colors: darkColors, space, radius, fontFamily, fontSize, typeScale };
