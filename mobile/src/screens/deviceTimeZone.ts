/**
 * The device IANA time zone. Hermes implements Intl.DateTimeFormat (React Native's Hermes docs),
 * so no native module is needed; expo-localization (getCalendars()[0].timeZone) is the documented
 * alternative but is not installed. Falls back to UTC when unavailable.
 */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
