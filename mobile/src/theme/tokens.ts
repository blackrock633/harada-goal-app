import { Platform, type TextStyle } from 'react-native';

/**
 * Design tokens. The world is the printed Harada sheet: a ruled paper form, ink entries, one
 * vermilion (朱) for what matters now. Structure comes from hairlines and type, not boxes.
 * DESIGN.md (project root) documents the system; change it there first.
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
  /** Text and icons on `accentSoft` (≥ 4.5:1); never put `accent` text on `accentSoft`. */
  accentOnSoft: string;
  success: string;
  warning: string;
  danger: string;
  /** Focus ring for keyboard and switch-control focus. */
  focus: string;
  /** Modal scrim. */
  scrim: string;
};

export const lightColors: ColorTokens = {
  paper: '#F7F5F0',
  surface: '#FFFFFF',
  surfaceSunken: '#EFECE5',
  ink: '#1B1A17',
  inkMuted: '#5E5A52',
  inkFaint: '#6F6A61',
  rule: '#E2DED4',
  ruleStrong: '#CBC6BA',
  ruleInput: '#857F74',
  accent: '#C2401C',
  accentInk: '#FFFFFF',
  accentSoft: '#F6E4DC',
  accentOnSoft: '#9E3214',
  success: '#2F6B43',
  warning: '#8F5A0B',
  danger: '#B0261B',
  focus: '#C2401C',
  scrim: 'rgba(27,26,23,0.45)',
};

export const darkColors: ColorTokens = {
  paper: '#131311',
  surface: '#1B1A18',
  surfaceSunken: '#0E0E0D',
  ink: '#EEEBE4',
  inkMuted: '#A6A196',
  inkFaint: '#8E897F',
  rule: '#2C2A26',
  ruleStrong: '#3D3A35',
  ruleInput: '#77726A',
  accent: '#EB6A45',
  accentInk: '#1B0B05',
  accentSoft: '#3A1E15',
  accentOnSoft: '#F49B7E',
  success: '#6FBF8A',
  warning: '#E0A64A',
  danger: '#F07A6E',
  focus: '#EB6A45',
  scrim: 'rgba(0,0,0,0.6)',
};

/** 4pt scale: space[1] = 4. Tight inside a group, generous between groups. */
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

/**
 * Corners. The form's cells are square (`none`); controls get a small, deliberate radius;
 * only sheets and pills round more. Never one big radius on everything.
 */
export const radius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 14,
  full: 999,
} as const;

/** Minimum touch target (iOS 44 pt; Android asks 48 dp, so the Android value is used there). */
export const MIN_TOUCH = Platform.OS === 'android' ? 48 : 44;
/** Text is never smaller than this. */
export const MIN_FONT_SIZE = 12;

/** Widest a reading column gets on tablet and desktop. */
export const CONTENT_MAX_WIDTH = 680;
/** Width at which layouts switch from phone to wide (tablet / desktop web). */
export const WIDE_BREAKPOINT = 768;

/** Motion: short and functional. Honour Reduce Motion (useReducedMotion) everywhere. */
export const duration = {
  fast: 120,
  base: 200,
  slow: 280,
} as const;

/**
 * Shippori Mincho B1 is the display voice: Mincho is the face of Japanese printed forms, the
 * Harada sheet's own home. Everything operational uses the platform UI face (SF / Roboto) so it
 * follows Dynamic Type and feels native.
 */
const SYSTEM_UI = Platform.select({ ios: 'System', web: 'System', default: undefined });

export const fontFamily = {
  display: 'ShipporiMinchoB1_700Bold',
  displayRegular: 'ShipporiMinchoB1_500Medium',
  ui: SYSTEM_UI,
} as const;

export type FontWeight = 'regular' | 'medium' | 'semibold' | 'bold';

export const fontWeight: Record<FontWeight, TextStyle['fontWeight']> = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
};

export const fontSize = {
  xs: 12,
  sm: 13,
  md: 15,
  base: 17,
  lg: 20,
  xl: 22,
  '2xl': 28,
  '3xl': 34,
} as const;

/**
 * display / title / heading: Mincho, for the goal and screen-level names.
 * headline: UI semibold, the name of a row or group.
 * body: UI regular, the default (iOS Body is 17).
 * meta: UI 15, secondary lines. caption: UI 13, the smallest supporting text.
 */
export type TextVariant = 'display' | 'title' | 'heading' | 'headline' | 'body' | 'meta' | 'caption';

export type TextStyleToken = {
  fontFamily: string | undefined;
  fontSize: number;
  lineHeight: number;
  fontWeight?: TextStyle['fontWeight'];
  letterSpacing?: number;
};

export const typeScale: Record<TextVariant, TextStyleToken> = {
  display: { fontFamily: fontFamily.display, fontSize: fontSize['3xl'], lineHeight: 42, letterSpacing: -0.4 },
  title: { fontFamily: fontFamily.display, fontSize: fontSize['2xl'], lineHeight: 35, letterSpacing: -0.2 },
  heading: { fontFamily: fontFamily.display, fontSize: fontSize.lg, lineHeight: 27 },
  headline: { fontFamily: fontFamily.ui, fontSize: fontSize.base, lineHeight: 22, fontWeight: fontWeight.semibold },
  body: { fontFamily: fontFamily.ui, fontSize: fontSize.base, lineHeight: 24, fontWeight: fontWeight.regular },
  meta: { fontFamily: fontFamily.ui, fontSize: fontSize.md, lineHeight: 20, fontWeight: fontWeight.regular },
  caption: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, lineHeight: 18, fontWeight: fontWeight.regular },
};

export type Theme = {
  scheme: 'light' | 'dark';
  colors: ColorTokens;
  space: typeof space;
  radius: typeof radius;
  fontFamily: typeof fontFamily;
  fontSize: typeof fontSize;
  fontWeight: typeof fontWeight;
  typeScale: typeof typeScale;
  duration: typeof duration;
};

const shared = { space, radius, fontFamily, fontSize, fontWeight, typeScale, duration };
export const lightTheme: Theme = { scheme: 'light', colors: lightColors, ...shared };
export const darkTheme: Theme = { scheme: 'dark', colors: darkColors, ...shared };
