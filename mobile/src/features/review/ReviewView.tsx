import type { ReactNode } from 'react';
import { View } from 'react-native';

import type { GoalEventDTO, OutcomeDTO, ReflectionDTO } from '@shared/application/dto';
import { useTheme } from '@/theme';
import { EmptyState, Screen, Text } from '@/ui';
import { formatLocalDate } from '../today/format';
import { ReflectionCard } from './ReflectionCard';

export type ReviewViewProps = {
  /** Slot for <ReflectionForm />. */
  reflectionForm: ReactNode;
  /** GoalSummaryDTO.completedThisWeek. */
  completedThisWeek: number;
  outcomes: OutcomeDTO[];
  reflections: ReflectionDTO[];
  events: GoalEventDTO[];
};

type TimelineEntry =
  | { type: 'reflection'; date: string; sort: string; item: ReflectionDTO }
  | { type: 'event'; date: string; sort: string; item: GoalEventDTO };

/** Local-date key of an ISO instant (matches how the user sees their calendar). */
function isoToLocalDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Reflections and events merged, newest first, grouped by local date. */
export function buildTimeline(reflections: ReflectionDTO[], events: GoalEventDTO[]) {
  const entries: TimelineEntry[] = [
    ...reflections.map((r): TimelineEntry => ({ type: 'reflection', date: r.date, sort: r.createdAt, item: r })),
    ...events.map((e): TimelineEntry => ({ type: 'event', date: isoToLocalDate(e.occurredAt), sort: e.occurredAt, item: e })),
  ];
  entries.sort((a, b) => (a.date === b.date ? b.sort.localeCompare(a.sort) : b.date.localeCompare(a.date)));
  const groups: { date: string; entries: TimelineEntry[] }[] = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last && last.date === e.date) last.entries.push(e);
    else groups.push({ date: e.date, entries: [e] });
  }
  return groups;
}

export function ReviewView({ reflectionForm, completedThisWeek, outcomes, reflections, events }: ReviewViewProps) {
  const { colors, space } = useTheme();
  const groups = buildTimeline(reflections, events);
  return (
    <Screen>
      <View style={{ gap: space[3] }}>
        <Text variant="heading">Reflect</Text>
        {reflectionForm}
      </View>

      <View style={{ gap: space[3], marginTop: space[4] }}>
        <Text variant="heading">This week</Text>
        <Text variant="meta" tone="muted">
          {completedThisWeek === 0
            ? 'No tasks completed yet this week.'
            : `${completedThisWeek} ${completedThisWeek === 1 ? 'task' : 'tasks'} completed this week.`}
        </Text>
        {outcomes.length === 0 ? (
          <EmptyState title="No key areas yet" message="Add key areas in the matrix to see them here." />
        ) : (
          outcomes.map((o) => {
            const tasks = o.actions.filter((a) => a.kind === 'task' && !a.archivedAt);
            const doneCount = tasks.filter((a) => a.completedAt).length;
            return (
              <View key={o.id} style={{ gap: 2 }}>
                <Text variant="body" style={{ fontFamily: 'Inter_500Medium' }}>
                  {o.title}
                </Text>
                <Text variant="meta" tone="muted">
                  {tasks.length === 0 ? 'No tasks yet' : `${doneCount} of ${tasks.length} tasks done`}
                </Text>
                {o.measure ? (
                  <Text variant="meta" tone="muted">
                    {`Measure: ${o.measure.current} of ${o.measure.target} ${o.measure.unit}`}
                  </Text>
                ) : null}
              </View>
            );
          })
        )}
      </View>

      <View style={{ gap: space[3], marginTop: space[4] }}>
        <Text variant="heading">Recent activity</Text>
        {groups.length === 0 ? (
          <EmptyState
            title="Nothing here yet"
            message="Reflections and changes to your plan will appear here as you go."
          />
        ) : (
          groups.map((g) => (
            <View key={g.date} testID="timeline-group" style={{ gap: space[2] }}>
              <Text variant="meta" tone="muted" accessibilityRole="header" style={{ fontFamily: 'Inter_600SemiBold' }}>
                {formatLocalDate(g.date, 'long')}
              </Text>
              <View style={{ gap: space[3], borderLeftWidth: 1, borderLeftColor: colors.rule, paddingLeft: space[4] }}>
                {g.entries.map((e) =>
                  e.type === 'event' ? (
                    <Text key={`e-${e.item.id}`} variant="meta">
                      {e.item.summary}
                    </Text>
                  ) : (
                    <ReflectionCard key={`r-${e.item.id}`} reflection={e.item} />
                  ),
                )}
              </View>
            </View>
          ))
        )}
      </View>
    </Screen>
  );
}
