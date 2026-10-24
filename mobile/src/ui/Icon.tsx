import { SymbolView } from 'expo-symbols';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

/**
 * The app's icon vocabulary: SF Symbols on iOS, Material Symbols on Android and web. One name,
 * one meaning, everywhere. Add a name here rather than drawing a glyph in a screen.
 */
const ICONS = {
  add: { ios: 'plus', android: 'add' },
  edit: { ios: 'pencil', android: 'edit' },
  close: { ios: 'xmark', android: 'close' },
  check: { ios: 'checkmark', android: 'check' },
  back: { ios: 'chevron.left', android: 'chevron_left' },
  forward: { ios: 'chevron.right', android: 'chevron_right' },
  expand: { ios: 'chevron.down', android: 'keyboard_arrow_down' },
  routine: { ios: 'repeat', android: 'repeat' },
  task: { ios: 'circle', android: 'radio_button_unchecked' },
  date: { ios: 'calendar', android: 'calendar_today' },
  goal: { ios: 'target', android: 'target' },
  matrix: { ios: 'square.grid.3x3', android: 'grid_view' },
  focus: { ios: 'sun.max', android: 'wb_sunny' },
  focusOn: { ios: 'checkmark', android: 'check' },
  reflect: { ios: 'book', android: 'menu_book' },
  account: { ios: 'person.crop.circle', android: 'account_circle' },
  more: { ios: 'ellipsis', android: 'more_horiz' },
  archive: { ios: 'archivebox', android: 'archive' },
  warning: { ios: 'exclamationmark.triangle', android: 'warning' },
  today: { ios: 'checkmark.circle', android: 'check_circle' },
  measure: { ios: 'ruler', android: 'straighten' },
} as const;

export type IconName = keyof typeof ICONS;

export type IconProps = {
  name: IconName;
  /** Point size; defaults to 20 (matches body text). */
  size?: number;
  color?: ColorValue;
  weight?: 'regular' | 'medium' | 'semibold';
  style?: StyleProp<ViewStyle>;
};

/** Decorative by default: the control that holds it carries the accessible name. */
export function Icon({ name, size = 20, color, weight = 'regular', style }: IconProps) {
  const { colors } = useTheme();
  const n = ICONS[name];
  if (!n) return null;
  return (
    <SymbolView
      name={{ ios: n.ios, android: n.android, web: n.android }}
      size={size}
      tintColor={color ?? colors.ink}
      weight={weight}
      style={style}
      accessible={false}
      importantForAccessibility="no"
    />
  );
}
