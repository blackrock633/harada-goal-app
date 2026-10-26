import type { Card, CardInput, CardKind } from '@/data/premium';

/** Export sizes in pixels. The card is drawn at the same aspect ratio and resized on capture. */
export const FORMATS = {
  story: { label: 'Story', width: 1080, height: 1920 },
  square: { label: 'Square', width: 1080, height: 1080 },
  wide: { label: 'Wide', width: 1200, height: 630 },
} as const;
export type FormatId = keyof typeof FORMATS;

export type TextKey = 'accomplishment' | 'milestone' | 'lesson' | 'nextPriority';
/** Server limit for each text field. */
export const CARD_TEXT_MAX = 200;

/** Which optional text fields each kind of card offers, in card order. */
export const FIELDS: Record<CardKind, TextKey[]> = {
  progress: ['accomplishment', 'milestone', 'nextPriority'],
  weekly: ['lesson', 'nextPriority'],
  challenge: ['accomplishment', 'milestone', 'lesson'],
};

export function fieldLabel(key: TextKey, kind: CardKind): string {
  switch (key) {
    case 'accomplishment':
      return 'An accomplishment';
    case 'milestone':
      return 'A milestone';
    case 'lesson':
      return 'A lesson learned';
    case 'nextPriority':
      return kind === 'weekly' ? "Next week's priority" : 'Next priority';
  }
}

/** The heading a text field gets on the card. */
export const CARD_LABEL: Record<TextKey, string> = {
  accomplishment: 'Accomplished',
  milestone: 'Milestone',
  lesson: 'Lesson',
  nextPriority: 'Next',
};

export const KIND_LABEL: Record<CardKind, string> = { progress: 'Progress', weekly: 'This week', challenge: '30-Day Challenge' };

export const STATS_HINT: Record<CardKind, string> = {
  progress: 'Tasks done, key areas and actions planned',
  weekly: 'Actions completed vs due this week, routine check-ins',
  challenge: 'Challenge day, days with activity, tasks completed',
};

export interface ComposerState {
  show: { goalTitle: boolean; stats: boolean; name: boolean };
  text: Partial<Record<TextKey, string>>;
}

export const EMPTY_STATE: ComposerState = { show: { goalTitle: false, stats: false, name: false }, text: {} };

/** What is sent to the server: only ticked flags and non-empty text of the fields this kind offers. */
export function buildInput(goalId: string, kind: CardKind, s: ComposerState): CardInput {
  const input: CardInput = { goalId, kind, show: { goalTitle: s.show.goalTitle, stats: s.show.stats, name: s.show.name } };
  for (const key of FIELDS[kind]) {
    const v = s.text[key]?.trim();
    if (v) input[key] = v.slice(0, CARD_TEXT_MAX);
  }
  return input;
}

export const isCardKind = (v: unknown): v is CardKind => v === 'progress' || v === 'weekly' || v === 'challenge';

/** The numbers on a card as label/value pairs, in reading order. Only what the server returned. */
export function cardStats(card: Card): { value: string; label: string }[] {
  const st = card.stats;
  if (!st) return [];
  const out: { value: string; label: string }[] = [];
  const n = (v: number | undefined): v is number => typeof v === 'number';
  if (card.kind === 'challenge') {
    if (st.completed) out.push({ value: '30', label: 'days completed' });
    else if (n(st.day)) out.push({ value: `Day ${st.day}`, label: 'of 30' });
    if (n(st.activeDays)) out.push({ value: String(st.activeDays), label: st.activeDays === 1 ? 'day with activity' : 'days with activity' });
    if (n(st.tasksCompleted)) out.push({ value: String(st.tasksCompleted), label: 'tasks completed' });
  } else if (card.kind === 'weekly') {
    if (n(st.tasksCompleted) && n(st.tasksDue)) out.push({ value: `${st.tasksCompleted} of ${st.tasksDue}`, label: 'actions done of those due' });
    else if (n(st.tasksCompleted)) out.push({ value: String(st.tasksCompleted), label: 'actions completed' });
    if (n(st.routineChecks)) out.push({ value: String(st.routineChecks), label: 'routine check-ins' });
  } else {
    if (n(st.tasksDone) && n(st.tasksTotal)) out.push({ value: `${st.tasksDone} of ${st.tasksTotal}`, label: 'tasks done' });
    if (n(st.keyAreas)) out.push({ value: String(st.keyAreas), label: st.keyAreas === 1 ? 'key area' : 'key areas' });
    if (n(st.actionsPlanned)) out.push({ value: String(st.actionsPlanned), label: 'actions planned' });
  }
  return out;
}
