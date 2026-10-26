import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import type { ActionDTO, NextItemDTO, TodayDTO } from '@shared/application/dto';
import { errorMessage } from '@/data/errors';
import type { ExecutionMutations } from '@/data/mutations';
import { useTheme } from '@/theme';
import { Button, CheckCircle, ListRow, Text } from '@/ui';
import { describeSchedule } from '@/features/today/format';

/** Rows shown before "Open Today"; the full list lives on the Today tab. */
const MAX_ROWS = 6;

const doneOf = (a: ActionDTO) => (a.kind === 'routine' ? a.checkedToday : a.completedAt != null);

/**
 * Today's actions for the challenge goal (focus first, then what is due, then what is done), with the
 * same complete / check mutations as the Today tab. A row's mark flips after the server confirms.
 */
export function ChallengeToday({
  data,
  goalId,
  mutations,
  onChanged,
  onOpenToday,
}: {
  data: TodayDTO;
  goalId: string;
  mutations: ExecutionMutations;
  /** After a confirmed change, with whether it completed (true) or reopened (false). */
  onChanged: (completed: boolean) => void;
  onOpenToday: () => void;
}) {
  const { space } = useTheme();
  const [override, setOverride] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const inFlight = useRef(new Set<string>());
  const [error, setError] = useState<string | null>(null);

  // Fresh server data replaces the local marks.
  useEffect(() => setOverride({}), [data]);

  const mine = (l: NextItemDTO[]) => l.filter((i) => i.goalId === goalId);
  const seen = new Set<string>();
  const rows: { item: NextItemDTO; done: boolean }[] = [];
  for (const [list, done] of [[mine(data.focus), null], [mine(data.next), false], [mine(data.doneToday), true]] as const) {
    for (const item of list) {
      if (seen.has(item.action.id)) continue;
      seen.add(item.action.id);
      rows.push({ item, done: done ?? doneOf(item.action) });
    }
  }

  async function toggle(item: NextItemDTO, complete: boolean) {
    const a = item.action;
    if (inFlight.current.has(a.id)) return;
    inFlight.current.add(a.id);
    setPending(new Set(inFlight.current));
    setError(null);
    try {
      const routine = a.kind === 'routine';
      const res = routine
        ? await (complete ? mutations.checkRoutine : mutations.uncheckRoutine)({ actionId: a.id, date: data.today })
        : await (complete ? mutations.completeAction : mutations.reopenAction)({ actionId: a.id });
      if (res.ok) {
        setOverride((o) => ({ ...o, [a.id]: complete }));
        onChanged(complete);
      } else setError(errorMessage(res.error));
    } catch {
      setError(errorMessage({ code: 'UNAVAILABLE', message: '' }));
    } finally {
      inFlight.current.delete(a.id);
      setPending(new Set(inFlight.current));
    }
  }

  const shown = rows.slice(0, MAX_ROWS);
  return (
    <View style={{ gap: space[2] }}>
      {error ? (
        <Text variant="body" tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {shown.length === 0 ? (
        <Text variant="body" tone="muted">
          Nothing planned for today on this goal. Pick an action from your matrix, or add one to today&apos;s focus.
        </Text>
      ) : (
        <View>
          {shown.map(({ item, done: stored }, i) => {
            const a = item.action;
            const done = override[a.id] ?? stored;
            const routine = a.kind === 'routine';
            const busy = pending.has(a.id);
            const meta = [busy ? 'Saving…' : null, routine ? describeSchedule(a.schedule) || 'Routine' : 'Task', item.outcomeTitle]
              .filter(Boolean)
              .join(' · ');
            return (
              <ListRow
                key={a.id}
                title={a.title}
                meta={meta}
                metaIcon={routine ? 'routine' : undefined}
                done={done}
                divider={i < shown.length - 1}
                leading={
                  <CheckCircle
                    shape={routine ? 'square' : 'circle'}
                    checked={done}
                    busy={busy}
                    accessibilityLabel={done ? `Reopen: ${a.title}` : `Complete: ${a.title}`}
                    onPress={() => void toggle(item, !done)}
                  />
                }
              />
            );
          })}
        </View>
      )}
      <View style={{ alignItems: 'flex-start' }}>
        <Button
          title={rows.length > MAX_ROWS ? `Open Today (${rows.length - MAX_ROWS} more)` : 'Open Today'}
          variant="ghost"
          icon="today"
          onPress={onOpenToday}
          style={{ marginLeft: -space[2] }}
        />
      </View>
    </View>
  );
}
