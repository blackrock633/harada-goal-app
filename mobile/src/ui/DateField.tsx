import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { MIN_TOUCH, useTheme } from '@/theme';

import { Button } from './Button';
import { fromPickerDate, formatDateValue, toPickerDate } from './date-value';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { Text } from './Text';

export type DateFieldProps = {
  label: string;
  /** 'YYYY-MM-DD', or '' for no date. */
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string | null;
  /** Earliest / latest selectable day, 'YYYY-MM-DD'. */
  min?: string;
  max?: string;
  /** Shows a Clear action when a date is set (for optional dates). */
  clearable?: boolean;
  placeholder?: string;
  testID?: string;
};

/**
 * A date is picked, never typed. iOS: the system calendar (SwiftUI) in the app's sheet.
 * Android: the Material date dialog. Web: DateField.web.tsx (the browser's date input).
 */
export function DateField({ label, value, onChange, hint, error, min, max, clearable = false, placeholder = 'Choose a date', testID }: DateFieldProps) {
  const { colors, radius, space } = useTheme();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const borderColor = error ? colors.danger : colors.ruleInput;

  const show = () => {
    setDraft(value || fromPickerDate(min ? toPickerDate(min) : new Date()));
    setOpen(true);
  };

  return (
    <View style={{ gap: space[1] }}>
      <Text variant="meta" weight="medium" tone="muted">
        {label}
      </Text>
      <View style={[styles.row, { gap: space[2] }]}>
        <Pressable
          testID={testID}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${value ? formatDateValue(value) : 'not set'}`}
          accessibilityHint={error ?? hint ?? 'Opens a calendar'}
          onPress={show}
          style={({ pressed }) => [
            styles.field,
            {
              flex: 1,
              gap: space[2],
              paddingHorizontal: space[3],
              borderRadius: radius.md,
              borderWidth: error ? 2 : 1,
              borderColor,
              backgroundColor: pressed ? colors.surfaceSunken : colors.surface,
            },
          ]}
        >
          <Icon name="date" size={18} color={colors.inkMuted} />
          <Text variant="body" tone={value ? 'default' : 'faint'} tabular>
            {value ? formatDateValue(value) : placeholder}
          </Text>
        </Pressable>
        {clearable && value ? <Button title="Clear" variant="ghost" onPress={() => onChange('')} /> : null}
      </View>
      {hint && !error ? (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      ) : null}
      {error ? (
        <Text variant="caption" tone="danger" accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      {open ? (
        Platform.OS === 'android' ? (
          <AndroidDialog
            value={draft}
            min={min}
            max={max}
            onPick={(v) => {
              setOpen(false);
              onChange(v);
            }}
            onDismiss={() => setOpen(false)}
          />
        ) : (
          <Sheet
            visible
            title={label}
            onClose={() => setOpen(false)}
            footer={
              <Button
                title="Done"
                onPress={() => {
                  setOpen(false);
                  onChange(draft);
                }}
              />
            }
          >
            <IosCalendar value={draft} min={min} max={max} onChange={setDraft} />
          </Sheet>
        )
      ) : null}
    </View>
  );
}

function IosCalendar({ value, min, max, onChange }: { value: string; min?: string; max?: string; onChange: (v: string) => void }) {
  // Required lazily so the SwiftUI module is only loaded on iOS, and only when the calendar opens.
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { Host, DatePicker } = require('@expo/ui/swift-ui') as typeof import('@expo/ui/swift-ui');
  const { datePickerStyle, tint } = require('@expo/ui/swift-ui/modifiers') as typeof import('@expo/ui/swift-ui/modifiers');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const { colors } = useTheme();
  return (
    <Host matchContents style={{ minHeight: 340 }}>
      <DatePicker
        selection={toPickerDate(value)}
        range={{ start: min ? toPickerDate(min) : undefined, end: max ? toPickerDate(max) : undefined }}
        displayedComponents={['date']}
        onDateChange={(d) => onChange(fromPickerDate(d))}
        modifiers={[datePickerStyle('graphical'), tint(colors.accent)]}
      />
    </Host>
  );
}

function AndroidDialog({ value, min, max, onPick, onDismiss }: { value: string; min?: string; max?: string; onPick: (v: string) => void; onDismiss: () => void }) {
  // Required lazily so the Compose module is only loaded on Android.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Host, DatePickerDialog } = require('@expo/ui/jetpack-compose') as typeof import('@expo/ui/jetpack-compose');
  const { colors } = useTheme();
  return (
    <Host matchContents>
      <DatePickerDialog
        initialDate={toPickerDate(value).toISOString()}
        selectableDates={{ start: min ? toPickerDate(min) : undefined, end: max ? toPickerDate(max) : undefined }}
        color={colors.accent}
        onDateSelected={(d) => onPick(fromPickerDate(d))}
        onDismissRequest={onDismiss}
      />
    </Host>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  field: { minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center' },
});
