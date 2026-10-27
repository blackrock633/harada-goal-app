/**
 * Data access for Harada Pro, the 30-Day Challenge, sharing, referrals, AI planning and analytics
 * (supabase/migrations/20261026*, supabase/functions/{billing-*,stripe-webhook,ai-plan}).
 *
 * The device never decides access: it shows what get_my_plan() says, and every premium read or write is
 * checked again by the database (HG402 → UPGRADE_REQUIRED). Payments happen on Stripe's pages, opened
 * in the browser; the plan changes only when Stripe's signed webhook reaches the server.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppError, Result } from '@shared/application/result';
import type { Template } from '@shared/domain/templates';

import { newClientId } from './errors';
import { QueryError } from './reads';
import { thrownToAppError, toAppError } from './rpc-errors';
import { getSupabase } from './supabase';

// ---------------------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------------------

export type Feature =
  | 'multiple_goals'
  | 'progress_history'
  | 'advanced_reviews'
  | 'premium_templates'
  | 'ai_planning'
  | 'insights'
  | 'challenge';

export interface PlanInfo {
  plan: 'free' | 'pro';
  features: Feature[];
  /** null = no limit. */
  maxActiveGoals: number | null;
  activeGoals: number;
  /** More active goals than the plan allows (after a downgrade); the user picks one to keep. */
  overLimit: boolean;
  subscription: {
    status: string;
    priceId: 'pro_monthly' | 'pro_annual' | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    hasBillingAccount: boolean;
  } | null;
  /** Complimentary access, when that is what makes the user Pro. */
  grant: { expiresAt: string | null } | null;
}

export interface Price {
  id: 'pro_monthly' | 'pro_annual';
  amountCents: number;
  currency: string;
  interval: 'month' | 'year';
}

export interface TemplateSummary {
  id: string;
  tier: 'free' | 'premium';
  name: string;
  summary: string;
  outcomeCount: number;
  actionCount: number;
  locked: boolean;
}

export type TemplateContent = Omit<Template, 'id' | 'name' | 'summary'> & { id: string; name: string; summary: string; tier: 'free' | 'premium' };

export interface HistoryWeek {
  weekStart: string;
  tasksDue: number;
  tasksDueDone: number;
  tasksCompleted: number;
  routineChecks: number;
  reflections: number;
  planChanges: number;
}

export interface Enrollment {
  id: string;
  goalId: string;
  startDate: string;
  endDate: string;
  status: 'active' | 'completed' | 'left';
  committedAt: string;
  completedAt: string | null;
  finalReflection: string;
  accomplishments: string[];
  createdAt: string;
}

export interface ChallengeDay { date: string; tasksCompleted: number; routineChecks: number; reflections: number }

export interface ChallengeSummary {
  enrollment: Enrollment;
  goal: { id: string; title: string; successCriteria: string; status: string };
  today: string;
  /** 0 before the start, 1..30 while running. */
  day: number;
  daysRemaining: number;
  days: ChallengeDay[];
  activeDays: number;
  tasksCompleted: number;
  routineChecks: number;
  tasksPlanned: number;
  weeklyReviews: { week: number; done: boolean }[];
  milestones: { title: string; date: string }[];
}

export type CardKind = 'progress' | 'weekly' | 'challenge';

/** What the user chose to put on a card. Numbers are never sent: the server computes them. */
export interface CardInput {
  goalId: string;
  kind: CardKind;
  show: { goalTitle?: boolean; stats?: boolean; name?: boolean };
  accomplishment?: string;
  milestone?: string;
  lesson?: string;
  nextPriority?: string;
}

/** The card exactly as the server built it (preview, export and public link all use this). */
export interface Card {
  kind: CardKind;
  goalTitle?: string;
  name?: string;
  accomplishment?: string;
  milestone?: string;
  lesson?: string;
  nextPriority?: string;
  stats?: {
    tasksDone?: number; tasksTotal?: number; keyAreas?: number; actionsPlanned?: number;
    weekStart?: string; tasksCompleted?: number; tasksDue?: number; routineChecks?: number;
    day?: number; completed?: boolean; activeDays?: number;
  };
}

export type AiSuggestion =
  | { task: 'areas'; measurableOutcome: string | null; areas: { title: string; why: string }[] }
  | { task: 'actions'; actions: { title: string; kind: 'task' | 'routine'; cadence: 'daily' | 'weekly' | null }[] };

// ---------------------------------------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------------------------------------

const fail = (error: AppError) => ({ ok: false as const, error });

async function rpc<T>(name: string, args: Record<string, unknown>, supabase: SupabaseClient = getSupabase()): Promise<Result<T>> {
  try {
    const { data, error, status } = await supabase.rpc(name, args);
    if (error) return fail(toAppError(error, status));
    return { ok: true, data: data as T };
  } catch {
    return fail(thrownToAppError());
  }
}

/** Throwing variant for queries (TanStack wants a throw). */
async function read<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const r = await rpc<T>(name, args);
  if (!r.ok) throw new QueryError(r.error);
  return r.data;
}

/** Edge Functions answer with the app Result shape, on errors too (see deleteAccount.ts). */
async function invokeFunction<T>(name: string, body: unknown): Promise<Result<T>> {
  try {
    const { data, error } = await getSupabase().functions.invoke(name, { body: body as Record<string, unknown> });
    const isResult = (v: unknown): v is Result<T> => typeof v === 'object' && v !== null && typeof (v as { ok?: unknown }).ok === 'boolean';
    if (!error) return isResult(data) ? data : fail(thrownToAppError());
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      const parsed: unknown = await context.json().catch(() => null);
      if (isResult(parsed)) return parsed;
      return fail({ code: 'INTERNAL', message: 'Something went wrong. Please try again.' });
    }
    return fail(thrownToAppError());
  } catch {
    return fail(thrownToAppError());
  }
}

export const premiumKeys = {
  plan: ['plan'] as const,
  prices: ['prices'] as const,
  templates: ['templates'] as const,
  history: (goalId: string, weeks: number) => ['history', goalId, weeks] as const,
  enrollments: ['challenge', 'enrollments'] as const,
  challenge: (id: string) => ['challenge', 'summary', id] as const,
};

// ---------------------------------------------------------------------------------------------------------
// Plan, prices, billing
// ---------------------------------------------------------------------------------------------------------

export const loadPlan = () => read<PlanInfo>('get_my_plan');

export async function loadPrices(): Promise<Price[]> {
  const { data, error, status } = await getSupabase()
    .from('prices')
    .select('id, amount_cents, currency, billing_interval')
    .eq('active', true)
    .order('sort_order');
  if (error) throw new QueryError(toAppError(error, status));
  return (data ?? []).map((p) => ({ id: p.id, amountCents: p.amount_cents, currency: p.currency, interval: p.billing_interval }));
}

export const hasFeature = (plan: PlanInfo | undefined, f: Feature) => !!plan?.features.includes(f);

export function usePlan() {
  return useQuery({ queryKey: premiumKeys.plan, queryFn: loadPlan, staleTime: 60_000 });
}

export function usePrices() {
  return useQuery({ queryKey: premiumKeys.prices, queryFn: loadPrices, staleTime: 60 * 60_000 });
}

/** URL of Stripe Checkout for the chosen price. Nothing is charged until the user pays on Stripe's page. */
export const startCheckout = (priceId: Price['id']) => invokeFunction<{ url: string }>('billing-checkout', { priceId });

/** URL of the Stripe customer portal: payment method, invoices, switching plan, cancelling. */
export const openBillingPortal = () => invokeFunction<{ url: string }>('billing-portal', {});

/** After a downgrade: keep `goalId` active and archive the other active goals (restorable). */
export const chooseActiveGoal = (goalId: string) => rpc<unknown>('choose_active_goal', { p_input: { goalId } });

/** Formats a price for display, e.g. "$7.99". */
export function formatPrice(cents: number, currency = 'usd'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
}

// ---------------------------------------------------------------------------------------------------------
// Templates and history
// ---------------------------------------------------------------------------------------------------------

export async function loadTemplates(): Promise<TemplateSummary[]> {
  const rows = await read<{ id: string; tier: 'free' | 'premium'; name: string; summary: string; outcome_count: number; action_count: number; locked: boolean }[]>('list_templates');
  return rows.map((r) => ({ id: r.id, tier: r.tier, name: r.name, summary: r.summary, outcomeCount: r.outcome_count, actionCount: r.action_count, locked: r.locked }));
}

export const useTemplates = () => useQuery({ queryKey: premiumKeys.templates, queryFn: loadTemplates, staleTime: 10 * 60_000 });

export const getTemplate = (id: string) => rpc<TemplateContent>('get_template', { p_id: id });

/**
 * create_goal input for a template from the catalogue: a draft goal carrying the template's key areas and
 * actions, every id fresh; the goal id is the caller's client id so a retry is idempotent.
 */
export function templatePayload(t: TemplateContent, clientId: string) {
  return {
    id: clientId,
    title: t.goalTitle,
    vision: t.vision,
    purpose: t.purpose,
    templateId: t.id,
    outcomes: t.outcomes.slice(0, 8).map((o, i) => ({
      id: newClientId(),
      title: o.title,
      description: o.description,
      ...(o.measure ? { measure: o.measure } : {}),
      position: i,
      actions: o.actions.slice(0, 8).map((a, j) => ({
        id: newClientId(),
        title: a.title,
        kind: a.kind,
        position: j,
        ...(a.kind === 'routine' && a.schedule ? { schedule: a.schedule } : {}),
      })),
    })),
  };
}

export async function loadHistory(goalId: string, weeks: number): Promise<HistoryWeek[]> {
  const rows = await read<{ week_start: string; tasks_due: number; tasks_due_done: number; tasks_completed: number; routine_checks: number; reflections: number; plan_changes: number }[]>(
    'goal_history', { p_goal_id: goalId, p_weeks: weeks });
  return rows.map((r) => ({
    weekStart: r.week_start, tasksDue: r.tasks_due, tasksDueDone: r.tasks_due_done, tasksCompleted: r.tasks_completed,
    routineChecks: r.routine_checks, reflections: r.reflections, planChanges: r.plan_changes,
  }));
}

/** Pro only; `enabled` should follow the plan so a Free user never fires a request that must fail. */
export function useHistory(goalId: string | undefined, weeks: number, enabled: boolean) {
  return useQuery({ queryKey: premiumKeys.history(goalId ?? '', weeks), queryFn: () => loadHistory(goalId!, weeks), enabled: enabled && !!goalId });
}

// ---------------------------------------------------------------------------------------------------------
// Challenge
// ---------------------------------------------------------------------------------------------------------

type EnrollmentRow = {
  id: string; goal_id: string; start_date: string; end_date: string; status: Enrollment['status']; committed_at: string;
  completed_at: string | null; final_reflection: string; accomplishments: string[]; created_at: string;
};
export const enrollmentFromRow = (r: EnrollmentRow): Enrollment => ({
  id: r.id, goalId: r.goal_id, startDate: r.start_date, endDate: r.end_date, status: r.status, committedAt: r.committed_at,
  completedAt: r.completed_at, finalReflection: r.final_reflection, accomplishments: r.accomplishments ?? [], createdAt: r.created_at,
});

export async function loadEnrollments(): Promise<Enrollment[]> {
  const { data, error, status } = await getSupabase()
    .from('challenge_enrollments')
    .select('id, goal_id, start_date, end_date, status, committed_at, completed_at, final_reflection, accomplishments, created_at')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new QueryError(toAppError(error, status));
  return (data as EnrollmentRow[]).map(enrollmentFromRow);
}

export const useEnrollments = (enabled = true) =>
  useQuery({ queryKey: premiumKeys.enrollments, queryFn: loadEnrollments, enabled });

export async function loadChallengeSummary(id: string): Promise<ChallengeSummary> {
  const s = await read<Omit<ChallengeSummary, 'enrollment'> & { enrollment: EnrollmentRow }>('challenge_summary', { p_enrollment_id: id });
  return { ...s, enrollment: enrollmentFromRow({ ...s.enrollment }) };
}

export const useChallengeSummary = (id: string | undefined, enabled = true) =>
  useQuery({ queryKey: premiumKeys.challenge(id ?? ''), queryFn: () => loadChallengeSummary(id!), enabled: enabled && !!id });

/** Idempotent on `clientId`: a double tap or a retry never creates a second enrollment. */
export const joinChallenge = (clientId: string, goalId: string, startDate?: string) =>
  rpc<EnrollmentRow>('join_challenge', { p_input: { id: clientId, goalId, committed: true, ...(startDate ? { startDate } : {}) } });
export const leaveChallenge = (enrollmentId: string) => rpc<EnrollmentRow>('leave_challenge', { p_input: { enrollmentId } });
export const completeChallenge = (enrollmentId: string, finalReflection: string, accomplishments: string[]) =>
  rpc<EnrollmentRow>('complete_challenge', { p_input: { enrollmentId, finalReflection, accomplishments } });

// ---------------------------------------------------------------------------------------------------------
// Share cards (the image is made on the device)
// ---------------------------------------------------------------------------------------------------------

export const previewCard = (input: CardInput) => rpc<Card>('preview_share_card', { p_input: input });

// ---------------------------------------------------------------------------------------------------------
// AI planning
// ---------------------------------------------------------------------------------------------------------

export const suggestAreas = (goalTitle: string, successCriteria: string, existingAreas: string[]) =>
  invokeFunction<AiSuggestion & { task: 'areas' }>('ai-plan', { task: 'areas', goalTitle, successCriteria, existingAreas });
export const suggestActions = (goalTitle: string, areaTitle: string, existingActions: string[]) =>
  invokeFunction<AiSuggestion & { task: 'actions' }>('ai-plan', { task: 'actions', goalTitle, areaTitle, existingActions });

// ---------------------------------------------------------------------------------------------------------
// Analytics (first party; names and token-only properties, never content)
// ---------------------------------------------------------------------------------------------------------

export type EventName =
  | 'signup_started' | 'signup_completed' | 'onboarding_started' | 'goal_created' | 'supporting_area_created'
  | 'first_action_created' | 'first_action_completed' | 'weekly_review_completed' | 'challenge_day_completed'
  | 'challenge_completed' | 'progress_card_generated' | 'upgrade_page_viewed' | 'upgrade_prompt_shown' | 'premium_feature_used';

/** Fire and forget: analytics never blocks or breaks the app. Property values are numbers, booleans or [a-z0-9_] tokens. */
export function track(name: EventName, props: Record<string, string | number | boolean> = {}): void {
  try {
    void getSupabase()
      .rpc('track_event', { p_name: name, p_props: { platform: Platform.OS, ...props } })
      .then(() => undefined, () => undefined);
  } catch {
    // not configured or signed out: nothing to record
  }
}

/** Invalidate everything plan-dependent after a purchase, cancellation or grant. */
export function useRefreshPlan() {
  const qc = useQueryClient();
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: premiumKeys.plan }),
    qc.invalidateQueries({ queryKey: premiumKeys.templates }),
    qc.invalidateQueries({ queryKey: ['history'] }),
  ]);
}
