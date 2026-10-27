import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { AppError, Result } from '@shared/application/result';

import { errorMessage } from '@/data/errors';
import { suggestActions, suggestAreas, track } from '@/data/premium';
import { useTheme } from '@/theme';
import { Badge, Button, Text } from '@/ui';

import { openUpgrade } from './routes';
import { UpgradePrompt } from './UpgradePrompt';

export type SuggestedArea = { title: string; why: string };
export type SuggestedAction = { title: string; kind: 'task' | 'routine'; cadence: 'daily' | 'weekly' | null };

type Common = {
  /** The plan includes 'ai_planning'. Without it the button explains Harada Pro instead. */
  enabled: boolean;
  goalTitle: string;
  /** Open positions left to add into; Add is disabled at 0. */
  openPositions: number;
};

export type PlanSuggestionsProps = Common &
  (
    | {
        mode: 'areas';
        successCriteria: string;
        existingAreas: string[];
        /** Adds one key area into the next free position. */
        onAdd: (item: SuggestedArea) => Promise<Result<unknown>>;
      }
    | {
        mode: 'actions';
        areaTitle: string;
        existingActions: string[];
        /** Adds one action into the next free position. */
        onAdd: (item: SuggestedAction) => Promise<Result<unknown>>;
      }
  );

export const AI_DISCLOSURE =
  'Sends your goal title and the titles on this sheet to Anthropic’s Claude to draft suggestions. Nothing else.';

/** The words for a failed suggestion request. Nothing on the sheet changes in any of these cases. */
export function suggestionErrorMessage(error: AppError): string {
  // The Edge Function adds NOT_CONFIGURED to the app's codes (supabase/functions/_shared/ai-plan.ts).
  switch (error.code as string) {
    case 'NOT_CONFIGURED':
      return 'Suggestions aren’t available yet.';
    case 'RATE_LIMITED':
      return 'You’ve asked for a lot of suggestions in a short time. Try again in a little while.';
    case 'UNAVAILABLE':
      return 'Couldn’t reach the suggestion service. Nothing on your sheet changed — try again in a moment.';
    default:
      return errorMessage(error);
  }
}

type Item = { id: number; title: string; meta: string; source: SuggestedArea | SuggestedAction };
type ItemState = 'adding' | 'added' | { error: string };

/**
 * Optional drafting help for an empty key area or a key area's actions. Results are labelled
 * "Suggested" and accepted one at a time; adding fills the next free position and never touches
 * anything the user wrote.
 */
export function PlanSuggestions(props: PlanSuggestionsProps) {
  const { colors, space } = useTheme();
  const { enabled, mode, openPositions } = props;
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [state, setState] = useState<Record<number, ItemState>>({});
  const inFlight = useRef(false);
  const adding = useRef(false);
  const label = mode === 'areas' ? 'Suggest key areas' : 'Suggest actions';

  async function request() {
    if (inFlight.current) return;
    if (!enabled) {
      setLocked(true);
      openUpgrade('ai_planning');
      return;
    }
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      if (props.mode === 'areas') {
        const res = await suggestAreas(props.goalTitle, props.successCriteria, props.existingAreas);
        if (!res.ok) return fail(res.error);
        setItems(res.data.areas.map((a, i) => ({ id: i, title: a.title, meta: a.why, source: a })));
      } else {
        const res = await suggestActions(props.goalTitle, props.areaTitle, props.existingActions);
        if (!res.ok) return fail(res.error);
        setItems(
          res.data.actions.map((a, i) => ({
            id: i,
            title: a.title,
            meta: a.kind === 'routine' ? `Routine${a.cadence ? ` · ${a.cadence}` : ''}` : 'Task',
            source: a,
          })),
        );
      }
      setState({});
      track('premium_feature_used', { feature: 'ai_planning', task: mode });
    } catch {
      setError(suggestionErrorMessage({ code: 'UNAVAILABLE', message: '' }));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }

  function fail(e: AppError) {
    if (e.code === 'UPGRADE_REQUIRED') {
      setLocked(true);
      openUpgrade('ai_planning');
    } else setError(suggestionErrorMessage(e));
  }

  async function add(item: Item) {
    if (adding.current) return;
    adding.current = true;
    setState((s) => ({ ...s, [item.id]: 'adding' }));
    try {
      const res =
        props.mode === 'areas'
          ? await props.onAdd(item.source as SuggestedArea)
          : await props.onAdd(item.source as SuggestedAction);
      setState((s) => ({ ...s, [item.id]: res.ok ? 'added' : { error: errorMessage(res.error) } }));
    } catch {
      setState((s) => ({ ...s, [item.id]: { error: errorMessage({ code: 'UNAVAILABLE', message: '' }) } }));
    } finally {
      adding.current = false;
    }
  }

  return (
    <View style={{ gap: space[2] }} testID={`suggestions-${mode}`}>
      <View style={{ alignItems: 'flex-start', marginLeft: -8 }}>
        <Button
          title={items ? 'Suggest again' : label}
          variant="ghost"
          loading={loading}
          accessibilityLabel={enabled ? label : `${label} (Harada Pro)`}
          onPress={() => void request()}
        />
      </View>
      {enabled && !items ? (
        <Text variant="caption" tone="muted">
          {AI_DISCLOSURE}
        </Text>
      ) : null}
      {locked ? <UpgradePrompt feature="ai_planning" trigger="action" onDismiss={() => setLocked(false)} /> : null}
      {error ? (
        <Text variant="meta" tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {items ? (
        <View style={{ gap: space[1] }}>
          <View style={[styles.row, { gap: space[2] }]}>
            <Badge text="Suggested" />
          </View>
          {items.length === 0 ? (
            <Text variant="meta" tone="muted">
              No suggestions this time.
            </Text>
          ) : null}
          {items.map((it, i) => {
            const st = state[it.id];
            return (
              <View
                key={it.id}
                style={[
                  styles.row,
                  {
                    gap: space[3],
                    paddingVertical: space[2],
                    borderBottomWidth: i < items.length - 1 ? StyleSheet.hairlineWidth : 0,
                    borderBottomColor: colors.rule,
                  },
                ]}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="body">{it.title}</Text>
                  {it.meta ? (
                    <Text variant="meta" tone="muted">
                      {it.meta}
                    </Text>
                  ) : null}
                  {typeof st === 'object' ? (
                    <Text variant="meta" tone="danger" accessibilityRole="alert">
                      {st.error}
                    </Text>
                  ) : null}
                </View>
                {st === 'added' ? (
                  <Text variant="meta" tone="muted" accessibilityLabel={`Added: ${it.title}`}>
                    Added
                  </Text>
                ) : (
                  <Button
                    title="Add"
                    variant="secondary"
                    size="compact"
                    accessibilityLabel={`Add suggested ${mode === 'areas' ? 'key area' : 'action'}: ${it.title}`}
                    loading={st === 'adding'}
                    disabled={openPositions <= 0 || (st !== 'adding' && Object.values(state).includes('adding'))}
                    onPress={() => void add(it)}
                  />
                )}
              </View>
            );
          })}
          {openPositions <= 0 ? (
            <Text variant="caption" tone="muted">
              {mode === 'areas' ? 'All 8 key areas are filled.' : 'All 8 positions are planned.'}
            </Text>
          ) : null}
          <View style={{ alignItems: 'flex-start', marginLeft: -8 }}>
            <Button
              title="Clear suggestions"
              variant="ghost"
              size="compact"
              onPress={() => {
                setItems(null);
                setState({});
              }}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
