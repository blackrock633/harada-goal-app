import { StyleSheet, View } from 'react-native';

import type { HistoryWeek } from '@/data/premium';
import { useTheme } from '@/theme';
import { EmptyState, ProgressBar, Section, SegmentedControl, Text } from '@/ui';
import type { OutcomeDTO } from '@shared/application/dto';

import { UpgradePrompt } from './UpgradePrompt';

export type HistoryRange = 4 | 12 | 26;

export type HistoryViewProps = {
  goalTitle: string;
  range: HistoryRange;
  onRangeChange: (range: HistoryRange) => void;
  /** goal_history rows for the range (any order). */
  weeks: HistoryWeek[];
  /** Key areas of the goal, for the per-area completion ('insights'). */
  outcomes: OutcomeDTO[];
  /** Whether the plan includes the 'insights' feature. */
  insights: boolean;
};

const RANGES = [
  { value: '4', label: '4 weeks' },
  { value: '12', label: '12 weeks' },
  { value: '26', label: '26 weeks' },
] as const;

export const ACTIVITY_NOTE = 'These count activity. They don’t measure how close you are to the goal itself.';

const active = (w: HistoryWeek) => w.tasksCompleted + w.routineChecks + w.reflections > 0;

/** "Oct 5" for a week's Monday. */
function weekLabel(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00`);
  return isNaN(d.getTime()) ? weekStart : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Week-by-week activity for one goal, drawn with plain views: one row per week, newest first, a bar
 * scaled to the busiest week in the range. Every block says what it counts.
 */
export function HistoryView({ goalTitle, range, onRangeChange, weeks, outcomes, insights }: HistoryViewProps) {
  const { space } = useTheme();
  const rows = [...weeks].sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  const activeWeeks = rows.filter(active).length;

  return (
    <View style={{ gap: space[6] }}>
      <View style={{ gap: space[2] }}>
        <Text variant="title" accessibilityRole="header">
          {goalTitle}
        </Text>
        <SegmentedControl
          label="History range"
          options={RANGES}
          value={String(range) as (typeof RANGES)[number]['value']}
          onChange={(v) => onRangeChange(Number(v) as HistoryRange)}
        />
        <Text variant="meta" tone="muted" testID="activity-note">
          {ACTIVITY_NOTE}
        </Text>
      </View>

      {activeWeeks < 2 ? (
        <EmptyState
          title="Not enough history yet"
          message="History needs at least two weeks with some activity. Complete tasks, check routines or write a reflection, and the weeks will start to line up here."
        />
      ) : (
        <>
          <Section title="Consistency">
            <Text variant="headline" tabular>{`Active in ${activeWeeks} of ${rows.length} weeks`}</Text>
            <ProgressBar
              value={rows.length ? (activeWeeks / rows.length) * 100 : 0}
              showValue={false}
              accessibilityLabel={`Active in ${activeWeeks} of ${rows.length} weeks`}
            />
          </Section>

          <Section title="Planned and done">
            <WeekBars
              rows={rows.map((w) => ({
                week: w.weekStart,
                value: w.tasksDueDone,
                total: w.tasksDue,
                text: w.tasksDue === 0 ? 'None due' : `${w.tasksDueDone} of ${w.tasksDue}`,
                a11y: w.tasksDue === 0 ? 'no tasks due' : `${w.tasksDueDone} of ${w.tasksDue} tasks due were done`,
              }))}
            />
          </Section>

          <Section title="Tasks completed" description="Every task completed in the week, due or not.">
            <WeekBars rows={rows.map((w) => count(w.weekStart, w.tasksCompleted, 'task completed', 'tasks completed'))} />
          </Section>

          <Section title="Routine days checked" description="Each routine checked on a day counts once.">
            <WeekBars rows={rows.map((w) => count(w.weekStart, w.routineChecks, 'routine check', 'routine checks'))} />
          </Section>

          <Section title="Reflections" description="Daily, weekly and monthly reflections written for this goal.">
            <WeekBars rows={rows.map((w) => count(w.weekStart, w.reflections, 'reflection', 'reflections'))} />
          </Section>
        </>
      )}

      <Section title="Completion by key area">
        {insights ? (
          outcomes.length === 0 ? (
            <Text tone="muted">No key areas yet.</Text>
          ) : (
            <KeyAreaCompletion outcomes={outcomes} />
          )
        ) : (
          <UpgradePrompt feature="insights" />
        )}
      </Section>
    </View>
  );
}

type BarRow = { week: string; value: number; total?: number; text: string; a11y: string };

function count(week: string, n: number, one: string, many: string): BarRow {
  return { week, value: n, text: String(n), a11y: `${n} ${n === 1 ? one : many}` };
}

/**
 * Horizontal bars, one per week. With `total`, the track is the total (sunken) and the fill is the
 * value; without, the fill is the value. All bars share one scale: the largest number in the block.
 */
function WeekBars({ rows }: { rows: BarRow[] }) {
  const { colors, space } = useTheme();
  const max = Math.max(1, ...rows.map((r) => Math.max(r.value, r.total ?? 0)));
  return (
    <View>
      {rows.map((r, i) => {
        const outer = r.total !== undefined ? r.total / max : r.value / max;
        const inner = r.total !== undefined ? (r.total === 0 ? 0 : r.value / r.total) : 1;
        return (
          <View
            key={r.week}
            accessible
            accessibilityLabel={`Week of ${weekLabel(r.week)}: ${r.a11y}`}
            style={[
              styles.barRow,
              {
                gap: space[3],
                paddingVertical: space[2],
                borderBottomWidth: i < rows.length - 1 ? StyleSheet.hairlineWidth : 0,
                borderBottomColor: colors.rule,
              },
            ]}
          >
            <Text variant="caption" tone="muted" tabular style={styles.barLabel}>
              {weekLabel(r.week)}
            </Text>
            <View style={styles.barTrack}>
              {outer > 0 ? (
                <View style={{ width: `${outer * 100}%`, height: 10, backgroundColor: r.total !== undefined ? colors.surfaceSunken : colors.ink, borderWidth: r.total !== undefined ? StyleSheet.hairlineWidth : 0, borderColor: colors.ruleStrong }}>
                  {r.total !== undefined && inner > 0 ? (
                    <View style={{ width: `${inner * 100}%`, height: '100%', backgroundColor: colors.ink }} />
                  ) : null}
                </View>
              ) : (
                <View style={{ height: 10, width: StyleSheet.hairlineWidth, backgroundColor: colors.ruleStrong }} />
              )}
            </View>
            <Text variant="caption" tabular style={styles.barValue}>
              {r.text}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function KeyAreaCompletion({ outcomes }: { outcomes: OutcomeDTO[] }) {
  const { colors, space } = useTheme();
  const live = outcomes.filter((o) => !o.archivedAt);
  return (
    <View>
      {live.map((o, i) => (
        <View
          key={o.id}
          style={{
            gap: space[1],
            paddingVertical: space[3],
            borderBottomWidth: i < live.length - 1 ? StyleSheet.hairlineWidth : 0,
            borderBottomColor: colors.rule,
          }}
        >
          <Text variant="body" weight="medium">
            {o.title}
          </Text>
          <Text variant="meta" tone="muted" tabular>
            {o.totalTasks === 0 ? 'No tasks yet' : `${o.completedTasks} of ${o.totalTasks} tasks done`}
          </Text>
          {o.totalTasks > 0 ? (
            <ProgressBar
              value={(o.completedTasks / o.totalTasks) * 100}
              showValue={false}
              accessibilityLabel={`${o.title}: ${o.completedTasks} of ${o.totalTasks} tasks done`}
            />
          ) : null}
          {o.routineCount > 0 ? (
            <Text variant="meta" tone="muted" tabular>
              {o.routineAdherence === null
                ? 'No routine data yet'
                : `Routines kept: ${Math.round(o.routineAdherence * 100)}% over 28 days`}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  barRow: { flexDirection: 'row', alignItems: 'center' },
  barLabel: { width: 52 },
  barTrack: { flex: 1, minWidth: 0 },
  barValue: { width: 64, textAlign: 'right' },
});
