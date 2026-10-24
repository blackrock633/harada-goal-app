import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { GoalEventDTO, OutcomeDTO, ReflectionDTO } from '@shared/application/dto';
import { useTheme } from '@/theme';
import { EmptyState, Screen, Section, Text, useLayout } from '@/ui';
import { formatLocalDate } from '../today/format';
import { ReflectionCard } from './ReflectionCard';

export type ReviewViewProps = {
  /** Pull-to-refresh, wired by the route to the query refetch. */
  refreshing?: boolean;
  onRefresh?: () => void;
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
    ...reflections.map((r): TimelineEntry => ({
      type: 'reflection',
      date: r.date,
      sort: r.createdAt,
      item: r,
    })),
    ...events.map((e): TimelineEntry => ({
      type: 'event',
      date: isoToLocalDate(e.occurredAt),
      sort: e.occurredAt,
      item: e,
    })),
  ];
  entries.sort((a, b) =>
    a.date === b.date ? b.sort.localeCompare(a.sort) : b.date.localeCompare(a.date),
  );
  const groups: { date: string; entries: TimelineEntry[] }[] = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last && last.date === e.date) last.entries.push(e);
    else groups.push({ date: e.date, entries: [e] });
  }
  return groups;
}

export function ReviewView({
  reflectionForm,
  completedThisWeek,
  outcomes,
  reflections,
  events,
  refreshing,
  onRefresh,
}: ReviewViewProps) {
  const { colors, space } = useTheme();
  const { width } = useLayout();
  const twoPane = width >= 1024;
  const groups = buildTimeline([], events);
  const sortedReflections = [...reflections].sort((a, b) =>
    a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date),
  );

  const form = (
    <View style={{ gap: space[4], maxWidth: 560 }}>
      {/* On phones the screen header already names this; the heading pairs with "Past reflections" side by side. */}
      {twoPane ? <Text variant="heading">Reflect</Text> : null}
      {reflectionForm}
    </View>
  );

  const history = (
    <View style={{ gap: space[6] }}>
      <Section title="Past reflections" ruled={!twoPane}>
        {sortedReflections.length === 0 ? (
          <Text tone="muted">
            No reflections yet. Entries you save will appear here, newest first.
          </Text>
        ) : (
          <View>
            {sortedReflections.map((r) => (
              <ReflectionCard key={r.id} reflection={r} />
            ))}
          </View>
        )}
      </Section>

      <Section title="This week">
        <Text variant="meta" tone="muted">
          {completedThisWeek === 0
            ? 'No tasks completed yet this week.'
            : `${completedThisWeek} ${completedThisWeek === 1 ? 'task' : 'tasks'} completed this week.`}
        </Text>
        {outcomes.length === 0 ? (
          <EmptyState
            title="No key areas yet"
            message="Add key areas in the matrix to see them here."
          />
        ) : (
          <View>
            {outcomes.map((o, i) => {
              const tasks = o.actions.filter((a) => a.kind === 'task' && !a.archivedAt);
              const doneCount = tasks.filter((a) => a.completedAt).length;
              return (
                <View
                  key={o.id}
                  style={{
                    gap: 2,
                    paddingVertical: space[3],
                    borderBottomWidth: i < outcomes.length - 1 ? StyleSheet.hairlineWidth : 0,
                    borderBottomColor: colors.rule,
                  }}
                >
                  <Text variant="body" weight="medium">
                    {o.title}
                  </Text>
                  <Text variant="meta" tone="muted" tabular>
                    {tasks.length === 0
                      ? 'No tasks yet'
                      : `${doneCount} of ${tasks.length} tasks done`}
                  </Text>
                  {o.measure ? (
                    <Text variant="meta" tone="muted" tabular>
                      {`Measure: ${o.measure.current} of ${o.measure.target} ${o.measure.unit}`}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </Section>

      {groups.length > 0 ? (
        <Section title="Plan changes">
          {groups.map((g) => (
            <View key={g.date} testID="timeline-group" style={{ gap: space[1] }}>
              <Text
                variant="caption"
                weight="semibold"
                tone="muted"
                tabular
                accessibilityRole="header"
              >
                {formatLocalDate(g.date, 'long')}
              </Text>
              {g.entries.map((e) =>
                e.type === 'event' ? (
                  <Text key={`e-${e.item.id}`} variant="meta">
                    {e.item.summary}
                  </Text>
                ) : null,
              )}
            </View>
          ))}
        </Section>
      ) : null}
    </View>
  );

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh} maxWidth={twoPane ? 'full' : undefined}>
      {twoPane ? (
        <View style={[styles.panes, { gap: space[10] }]}>
          <View style={styles.left}>{form}</View>
          <View style={[styles.right, { borderLeftColor: colors.rule, paddingLeft: space[10] }]}>
            {history}
          </View>
        </View>
      ) : (
        <>
          {form}
          {history}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  panes: { flexDirection: 'row', alignItems: 'flex-start' },
  left: { flex: 1, maxWidth: 560 },
  right: { flex: 1, borderLeftWidth: StyleSheet.hairlineWidth },
});
