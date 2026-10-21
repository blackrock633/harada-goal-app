import { Pressable, View } from 'react-native';

import type { GoalMutations } from '@/data/mutations';
import { useTheme } from '@/theme';
import { Badge, Button, Text, type BadgeTone } from '@/ui';
import type { GoalDetailDTO, GoalFieldsDTO } from '@shared/application/dto';

import { ActivateGoalButton } from './ActivateGoalButton';
import { PURPOSE_FIELDS, daysBetween } from './goalLogic';

export type GoalOverviewProps = {
  goal: GoalDetailDTO;
  /** Local date 'YYYY-MM-DD'. */
  today: string;
  activateGoal: GoalMutations['activateGoal'];
  onActivated?: (goal: GoalFieldsDTO) => void;
  onEdit?: () => void;
  onOpenMatrix?: () => void;
  onReview?: () => void;
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

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  const { space, colors } = useTheme();
  return (
    <View style={{ paddingVertical: space[3], borderBottomWidth: 1, borderBottomColor: colors.rule, gap: 2 }}>
      <Text variant="meta" tone="muted">
        {label}
      </Text>
      {children}
    </View>
  );
}

export function GoalOverview({
  goal,
  today,
  activateGoal,
  onActivated,
  onEdit,
  onOpenMatrix,
  onReview,
  onOpenArea,
}: GoalOverviewProps) {
  const { space, colors } = useTheme();
  const { metrics, pace } = goal;
  const rows = goal.matrix.outcomes;
  const filledAreas = rows.filter((o) => o !== null).length;
  const measured = goal.outcomes.filter((o) => o.measure !== null);
  const purposes = PURPOSE_FIELDS.filter((f) => goal.purpose[f.key].trim());
  const vision = goal.vision.trim();
  const criteria = goal.successCriteria.trim();

  return (
    <View style={{ gap: space[8] }}>
      <View style={{ gap: space[3] }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          <Badge text={STATUS_LABEL[goal.status]} tone={STATUS_TONE[goal.status]} />
          {pace !== 'unknown' ? <Badge text={PACE_LABEL[pace]} tone={PACE_TONE[pace]} /> : null}
        </View>
        <Text variant="title">{goal.title}</Text>
        <Text tone="muted">
          {goal.targetDate
            ? `Target date: ${longDate(goal.targetDate)} (${dayPhrase(goal.targetDate, today)})`
            : 'No target date'}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {onEdit ? <Button title="Edit goal" variant="secondary" onPress={onEdit} /> : null}
          {onOpenMatrix ? <Button title="Open matrix" variant="secondary" onPress={onOpenMatrix} /> : null}
          {onReview ? <Button title="Review" variant="secondary" onPress={onReview} /> : null}
        </View>
        {goal.status === 'draft' ? (
          <ActivateGoalButton goalId={goal.id} activateGoal={activateGoal} onActivated={onActivated} />
        ) : null}
      </View>

      <View style={{ gap: space[2] }}>
        <Text variant="heading">Where things stand</Text>
        <Figure label="Plan">
          <Text>{`${metrics.planning.filled} of ${metrics.planning.total} positions filled`}</Text>
        </Figure>
        <Figure label="Actions">
          {/* UX-01: a zero denominator is "No tasks yet", never "0 of 0". */}
          <Text>
            {metrics.totalTasks === 0 ? 'No tasks yet' : `${metrics.completedTasks} of ${metrics.totalTasks} tasks done`}
          </Text>
        </Figure>
        {metrics.routineCount > 0 ? (
          <Figure label="Routines">
            <Text>{`${metrics.routineCount} ${metrics.routineCount === 1 ? 'routine' : 'routines'}`}</Text>
            <Text variant="meta" tone="muted">
              {metrics.routineAdherence === null
                ? 'No routine data yet'
                : `Routines: ${Math.round(metrics.routineAdherence * 100)}% adherence over 28 days`}
            </Text>
          </Figure>
        ) : null}
        <Figure label="Goal attainment">
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
                <Text key={o.id}>
                  {`${o.title}: ${fmtNum(o.measure!.current)} / ${fmtNum(o.measure!.target)}${
                    o.measure!.unit ? ` ${o.measure!.unit}` : ''
                  }`}
                </Text>
              ))}
              {metrics.attainment !== null ? (
                <>
                  <Text>{`Measured attainment: ${Math.round(metrics.attainment * 100)}%`}</Text>
                  <Text variant="meta" tone="muted">
                    Averaged from the measures on your key areas. Tasks and routines are not included.
                  </Text>
                </>
              ) : null}
            </>
          )}
        </Figure>
      </View>

      {criteria ? (
        <View style={{ gap: space[2] }}>
          <Text variant="heading">How you&apos;ll know</Text>
          <Text>{criteria}</Text>
        </View>
      ) : null}

      {vision ? (
        <View style={{ gap: space[2] }}>
          <Text variant="heading">Vision</Text>
          <Text>{vision}</Text>
        </View>
      ) : null}

      {purposes.length > 0 ? (
        <View style={{ gap: space[3] }}>
          <Text variant="heading">Why it matters</Text>
          {purposes.map((f) => (
            <View key={f.key}>
              <Text variant="meta" tone="muted">
                {f.label}
              </Text>
              <Text>{goal.purpose[f.key]}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ gap: space[2] }}>
        <Text variant="heading">Key areas</Text>
        {filledAreas === 0 ? (
          <Text tone="muted">No key areas yet. Key areas break your goal into up to eight parts.</Text>
        ) : null}
        {rows.map((o, i) => (
          <View
            key={i}
            testID={`key-area-row-${i}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: space[3],
              minHeight: 44,
              borderBottomWidth: 1,
              borderBottomColor: colors.rule,
            }}
          >
            {o ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open key area ${i + 1}: ${o.title}`}
                  onPress={() => onOpenArea(o.position ?? i)}
                  style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}
                >
                  <Text>{`${i + 1}. ${o.title}`}</Text>
                </Pressable>
                <Text variant="meta" tone="muted">
                  {`${o.actions.filter((a) => a.archivedAt === null).length} actions`}
                </Text>
              </>
            ) : (
              <>
                <Text tone="muted">{`${i + 1}. Empty slot`}</Text>
                <Button
                  title="Add"
                  variant="ghost"
                  accessibilityLabel={`Add key area ${i + 1}`}
                  onPress={() => onOpenArea(i)}
                />
              </>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}
