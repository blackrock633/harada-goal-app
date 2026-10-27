import { StyleSheet, View } from 'react-native';

import type { GoalMutations } from '@/data/mutations';
import { useTheme } from '@/theme';
import { Badge, Button, Icon, ListRow, ProgressBar, Section, Text, type BadgeTone } from '@/ui';
import type { GoalDetailDTO, GoalFieldsDTO } from '@shared/application/dto';

import { AchieveGoal } from './AchieveGoal';
import { ActivateGoalButton } from './ActivateGoalButton';
import { PURPOSE_FIELDS, daysBetween } from './goalLogic';

export type GoalOverviewProps = {
  goal: GoalDetailDTO;
  /** Local date 'YYYY-MM-DD'. */
  today: string;
  activateGoal: GoalMutations['activateGoal'];
  onActivated?: (goal: GoalFieldsDTO) => void;
  /** When given, an active goal offers "Mark goal achieved" (then, optionally, sharing it). */
  markGoalAchieved?: GoalMutations['markGoalAchieved'];
  onAchieved?: () => void;
  /** Shown as a ghost button when the route has no header action for it. */
  onEdit?: () => void;
  onOpenMatrix?: () => void;
  /** Open (or add to) the key area in slot `position` (0..7). */
  onOpenArea: (position: number) => void;
};

const STATUS_LABEL = { draft: 'Draft', active: 'Active', achieved: 'Achieved', archived: 'Archived' } as const;
const STATUS_TONE: Record<GoalDetailDTO['status'], BadgeTone> = {
  draft: 'neutral',
  active: 'accent',
  achieved: 'success',
  archived: 'neutral',
};
const PACE_LABEL = {
  ahead: 'Ahead (by measures)',
  on_track: 'On track (by measures)',
  behind: 'Behind (by measures)',
  overdue: 'Overdue (by measures)',
} as const;
const PACE_TONE: Record<keyof typeof PACE_LABEL, BadgeTone> = {
  ahead: 'success',
  on_track: 'accent',
  behind: 'warning',
  overdue: 'danger',
};
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function longDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${day}, ${y}`;
}

function dayPhrase(target: string, today: string): string {
  const n = daysBetween(today, target);
  if (n === 0) return 'today';
  if (n === 1) return '1 day left';
  if (n > 1) return `${n} days left`;
  if (n === -1) return '1 day ago';
  return `${Math.abs(n)} days ago`;
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

function Measure({ label, last, children }: { label: string; last?: boolean; children: React.ReactNode }) {
  const { space, colors } = useTheme();
  return (
    <View
      style={{
        paddingVertical: space[3],
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: colors.rule,
        gap: space[1],
      }}
    >
      <Text variant="meta" weight="medium" tone="muted">
        {label}
      </Text>
      {children}
    </View>
  );
}

export function GoalOverview({ goal, today, activateGoal, onActivated, markGoalAchieved, onAchieved, onEdit, onOpenMatrix, onOpenArea }: GoalOverviewProps) {
  const { space, colors } = useTheme();
  const { metrics, pace } = goal;
  const rows = goal.matrix.outcomes;
  const filledAreas = rows.filter((o) => o !== null).length;
  const measured = goal.outcomes.filter((o) => o.measure !== null);
  const purposes = PURPOSE_FIELDS.filter((f) => goal.purpose[f.key].trim());
  const vision = goal.vision.trim();
  const criteria = goal.successCriteria.trim();

  return (
    <View style={{ gap: space[6] }}>
      <View style={{ gap: space[3] }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          <Badge text={STATUS_LABEL[goal.status]} tone={STATUS_TONE[goal.status]} />
          {pace !== 'unknown' ? <Badge text={PACE_LABEL[pace]} tone={PACE_TONE[pace]} /> : null}
        </View>
        <Text variant="display">{goal.title}</Text>
        {goal.targetDate ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <Icon name="date" size={18} color={colors.inkMuted} />
            <Text tone="muted" tabular style={{ flexShrink: 1 }}>
              {`${longDate(goal.targetDate)} · ${dayPhrase(goal.targetDate, today)}`}
            </Text>
          </View>
        ) : null}
        {criteria ? (
          <View style={{ gap: space[1] }}>
            <Text variant="meta" weight="medium" tone="muted">
              How you&apos;ll know
            </Text>
            <Text>{criteria}</Text>
          </View>
        ) : null}
        {vision ? (
          <View style={{ gap: space[1] }}>
            <Text variant="meta" weight="medium" tone="muted">
              Vision
            </Text>
            <Text>{vision}</Text>
          </View>
        ) : null}
        <View style={{ gap: space[2], alignItems: 'flex-start', marginTop: space[1] }}>
          {goal.status === 'draft' ? (
            <ActivateGoalButton goalId={goal.id} activateGoal={activateGoal} onActivated={onActivated} />
          ) : goal.status === 'active' && onOpenMatrix ? (
            <Button title="Open matrix" icon="matrix" onPress={onOpenMatrix} />
          ) : null}
          {goal.status === 'active' && markGoalAchieved ? (
            <AchieveGoal goalId={goal.id} title={goal.title} markGoalAchieved={markGoalAchieved} onDone={onAchieved} />
          ) : null}
          {onEdit ? <Button title="Edit goal" icon="edit" variant="ghost" onPress={onEdit} /> : null}
        </View>
      </View>

      <Section title="Where things stand">
        <View>
          <Measure label="Planning">
            <Text tabular>{`${metrics.planning.filled} of ${metrics.planning.total} positions planned`}</Text>
            <ProgressBar value={metrics.planning.ratio * 100} accessibilityLabel="Positions planned" showValue={false} />
          </Measure>
          <Measure label="Action completion">
            {/* UX-01: a zero denominator is "No tasks yet", never "0 of 0". */}
            <Text tabular>
              {metrics.totalTasks === 0 ? 'No tasks yet' : `${metrics.completedTasks} of ${metrics.totalTasks} tasks done`}
            </Text>
            {metrics.routineCount > 0 ? (
              <Text tone="muted" tabular>
                {metrics.routineAdherence === null
                  ? 'No routine data yet'
                  : `Routines kept: ${Math.round(metrics.routineAdherence * 100)}% over 28 days`}
              </Text>
            ) : null}
          </Measure>
          <Measure label="Goal attainment" last>
            {measured.length === 0 && metrics.attainment === null ? (
              <>
                <Text>Not measured yet</Text>
                <Text variant="meta" tone="muted">
                  Add a measure to a key area to track real results.
                </Text>
              </>
            ) : (
              <>
                {measured.map((o) => (
                  <Text key={o.id} tabular>
                    {`${o.title}: ${fmtNum(o.measure!.current)} / ${fmtNum(o.measure!.target)}${
                      o.measure!.unit ? ` ${o.measure!.unit}` : ''
                    }`}
                  </Text>
                ))}
                {metrics.attainment !== null ? (
                  <>
                    <Text tabular>{`Measured attainment: ${Math.round(metrics.attainment * 100)}%`}</Text>
                  </>
                ) : null}
              </>
            )}
          </Measure>
        </View>
      </Section>

      <Section
        title="Key areas"
        description={filledAreas === 0 ? 'No key areas yet. Key areas break your goal into up to eight parts.' : undefined}
      >
        <View>
          {rows.map((o, i) => {
            const last = i === rows.length - 1;
            const number = (
              <Text variant="meta" weight="medium" tone="muted" tabular style={{ width: space[5], textAlign: 'right' }}>
                {String(i + 1)}
              </Text>
            );
            if (!o) {
              return (
                <ListRow
                  key={i}
                  testID={`key-area-row-${i}`}
                  title="Empty slot"
                  leading={number}
                  divider={!last}
                  trailing={
                    <Button
                      title="Add"
                      variant="ghost"
                      size="compact"
                      accessibilityLabel={`Add key area ${i + 1}`}
                      onPress={() => onOpenArea(i)}
                    />
                  }
                />
              );
            }
            const count = o.actions.filter((a) => a.archivedAt === null).length;
            return (
              <ListRow
                key={i}
                testID={`key-area-row-${i}`}
                title={o.title}
                meta={`${count} ${count === 1 ? 'action' : 'actions'}`}
                leading={number}
                chevron
                divider={!last}
                accessibilityLabel={`Open key area ${i + 1}: ${o.title}`}
                onPress={() => onOpenArea(o.position ?? i)}
              />
            );
          })}
        </View>
      </Section>

      {purposes.length > 0 ? (
        <Section title="Why it matters" description="Your answers to four prompts.">
          <View style={{ gap: space[3] }}>
            {purposes.map((f) => (
              <View key={f.key} style={{ gap: space[1] }}>
                <Text variant="meta" weight="medium" tone="muted">
                  {f.label}
                </Text>
                <Text>{goal.purpose[f.key]}</Text>
              </View>
            ))}
          </View>
        </Section>
      ) : null}
    </View>
  );
}
