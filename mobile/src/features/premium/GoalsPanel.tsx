import { useRef, useState } from 'react';
import { View } from 'react-native';

import { errorMessage } from '@/data/errors';
import type { GoalMutations } from '@/data/mutations';
import { hasFeature, type PlanInfo } from '@/data/premium';
import { useTheme } from '@/theme';
import { Badge, Button, ListRow, Section, Text } from '@/ui';
import type { GoalSummaryDTO } from '@shared/application/dto';

import { openUpgrade } from './routes';
import { UpgradePrompt } from './UpgradePrompt';

export type GoalsPanelProps = {
  /** Every goal the user has, archived included. */
  goals: GoalSummaryDTO[];
  /** The goal on screen; null when every goal is archived (only switching and restoring apply). */
  currentId: string | null;
  plan: PlanInfo | null | undefined;
  restoreGoal: GoalMutations['restoreGoal'];
  onOpenGoal: (goalId: string) => void;
  onNewGoal: () => void;
  onOpenHistory: () => void;
  onShare: () => void;
};

const STATUS = { active: 'Active', draft: 'Draft', achieved: 'Achieved', archived: 'Archived' } as const;

/**
 * Under the goal overview: switch between goals, start another, restore an archived one, and the
 * ways to look back (history, a shareable card).
 */
export function GoalsPanel({ goals, currentId, plan, restoreGoal, onOpenGoal, onNewGoal, onOpenHistory, onShare }: GoalsPanelProps) {
  const { space } = useTheme();
  const [showArchived, setShowArchived] = useState(currentId === null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<{ goalId: string; upgrade: boolean; message: string } | null>(null);
  const inFlight = useRef(false);
  const visible = goals.filter((g) => g.status !== 'archived');
  const archived = goals.filter((g) => g.status === 'archived');
  const multiple = hasFeature(plan ?? undefined, 'multiple_goals');
  const activeCount = visible.filter((g) => g.status === 'active').length;
  const historyLocked = !hasFeature(plan ?? undefined, 'progress_history');

  async function restore(goalId: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setRestoring(goalId);
    setRestoreError(null);
    try {
      const res = await restoreGoal({ goalId });
      if (!res.ok) {
        const upgrade = res.error.code === 'UPGRADE_REQUIRED';
        setRestoreError({ goalId, upgrade, message: errorMessage(res.error) });
        if (upgrade) {
          openUpgrade(
            'multiple_goals',
            'Restoring this goal would make it active again, next to your current one. It stays archived, with nothing lost.',
          );
        }
      }
    } catch {
      setRestoreError({ goalId, upgrade: false, message: errorMessage({ code: 'UNAVAILABLE', message: '' }) });
    } finally {
      inFlight.current = false;
      setRestoring(null);
    }
  }

  return (
    <View style={{ gap: space[6] }}>
      <Section
        title="Your goals"
      >
        <View>
          {visible.map((g, i) => {
            const current = g.id === currentId;
            return (
              <ListRow
                key={g.id}
                title={g.title}
                meta={current ? `${STATUS[g.status]} · Showing now` : STATUS[g.status]}
                divider={i < visible.length - 1}
                chevron={!current}
                onPress={current ? undefined : () => onOpenGoal(g.id)}
                accessibilityLabel={current ? `${g.title}, showing now` : `Show goal: ${g.title}`}
              />
            );
          })}
        </View>
        <View style={{ alignItems: 'flex-start' }}>
          <Button title="Start another goal" icon="add" variant="ghost" onPress={onNewGoal} />
        </View>
        {archived.length > 0 ? (
          <View style={{ gap: space[2] }}>
            <View style={{ alignItems: 'flex-start' }}>
              <Button
                title={showArchived ? 'Hide archived goals' : `Archived goals (${archived.length})`}
                variant="ghost"
                size="compact"
                icon={showArchived ? undefined : 'expand'}
                onPress={() => setShowArchived((v) => !v)}
              />
            </View>
            {showArchived ? (
              <View>
                {archived.map((g, i) => (
                  <View key={g.id}>
                    <ListRow
                      title={g.title}
                      meta="Archived. Its plan and history are kept."
                      divider={i < archived.length - 1}
                      trailing={
                        <Button
                          title="Restore"
                          variant="secondary"
                          size="compact"
                          accessibilityLabel={`Restore goal: ${g.title}`}
                          loading={restoring === g.id}
                          disabled={restoring !== null && restoring !== g.id}
                          onPress={() => void restore(g.id)}
                        />
                      }
                    />
                    {restoreError?.goalId === g.id ? (
                      restoreError.upgrade ? (
                        <UpgradePrompt
                          feature="multiple_goals"
                          trigger="action"
                          note="Restoring this goal would make it active again, next to your current one. It stays archived, with nothing lost."
                          onDismiss={() => setRestoreError(null)}
                        />
                      ) : (
                        <Text variant="meta" tone="danger" accessibilityRole="alert">
                          {restoreError.message}
                        </Text>
                      )
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </Section>

      {currentId === null ? null : (
      <Section title="Look back">
        <View>
          <ListRow
            title="Progress history"
            meta="Your activity week by week"
            chevron
            onPress={onOpenHistory}
            accessibilityLabel={historyLocked ? 'Progress history, part of Harada Pro' : 'Progress history'}
            trailing={historyLocked ? <Badge text="Pro" /> : undefined}
          />
          <ListRow
            title="Share progress"
            meta="A card with what you choose to show"
            chevron
            divider={false}
            onPress={onShare}
            accessibilityLabel="Share progress"
          />
        </View>
      </Section>
      )}
    </View>
  );
}
