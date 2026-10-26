/**
 * AI-assisted planning (Harada Pro): suggests key areas for a goal, or actions for one key area.
 *
 * Suggestions are only suggestions: the app shows them as editable drafts and saves nothing unless the user
 * adds them. The request carries only what the user is planning right now (goal title, success criteria,
 * the titles already on the sheet); never reflections, notes or other goals. Pure and dependency-injected:
 * the model call is `deps.generate`, wired to the Claude API in the ai-plan Edge Function, mocked in tests.
 *
 * Cost control: Pro only (user_has_feature 'ai_planning'), 20 requests per user per day (consume_ai_request),
 * small bounded inputs, and a bounded output schema.
 */

export type AiErrorCode = 'VALIDATION' | 'UNAUTHENTICATED' | 'UPGRADE_REQUIRED' | 'RATE_LIMITED' | 'NOT_CONFIGURED' | 'UNAVAILABLE' | 'INTERNAL';

export const AI_DAILY_LIMIT = 20;
const MAX_BODY_BYTES = 8192;

export type AiTask =
  | { task: 'areas'; goalTitle: string; successCriteria: string; existingAreas: string[] }
  | { task: 'actions'; goalTitle: string; areaTitle: string; existingActions: string[] };

export interface AreaSuggestion { title: string; why: string }
export interface ActionSuggestion { title: string; kind: 'task' | 'routine'; cadence: 'daily' | 'weekly' | null }
export type AiResult =
  | { task: 'areas'; measurableOutcome: string | null; areas: AreaSuggestion[] }
  | { task: 'actions'; actions: ActionSuggestion[] };

/** What the model returned: parsed JSON, a refusal, or nothing usable. */
export type GenerateOutcome = { kind: 'json'; value: unknown } | { kind: 'refusal' } | { kind: 'truncated' };

export interface AiDeps {
  configured: boolean;
  getUser(accessToken: string): Promise<{ id: string } | null>;
  hasFeature(userId: string): Promise<boolean>;
  consumeRequest(userId: string, limit: number): Promise<boolean>;
  generate(system: string, prompt: string, schema: Record<string, unknown>): Promise<GenerateOutcome>;
  track?(userId: string): Promise<void>;
  logError?(message: string, detail: unknown): void;
  allowedOrigins?: readonly string[];
}

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Validates the request body: known task, bounded strings, at most 8 existing titles. */
export function parseAiTask(body: unknown): AiTask | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const goalTitle = clean(b.goalTitle, 120);
  if (!goalTitle) return null;
  const titles = (v: unknown) =>
    Array.isArray(v) && v.length <= 8 && v.every((x) => typeof x === 'string') ? (v as string[]).map((x) => clean(x, 160)).filter(Boolean) : null;
  if (b.task === 'areas') {
    const existingAreas = titles(b.existingAreas ?? []);
    if (!existingAreas || existingAreas.length >= 8) return null;
    return { task: 'areas', goalTitle, successCriteria: clean(b.successCriteria, 500), existingAreas };
  }
  if (b.task === 'actions') {
    const areaTitle = clean(b.areaTitle, 120);
    const existingActions = titles(b.existingActions ?? []);
    if (!areaTitle || !existingActions || existingActions.length >= 8) return null;
    return { task: 'actions', goalTitle, areaTitle, existingActions };
  }
  return null;
}

export const SYSTEM_PROMPT = `You help people plan goals with the Harada method: one central goal, up to eight supporting key areas around it, and up to eight concrete actions for each key area.
Suggest practical, specific items the person could start this week. Prefer concrete, observable wording ("Run 3 times a week") over vague intentions ("Be more active").
Never promise outcomes. The person edits and chooses everything you suggest. Write titles in the same language as the goal.`;

/** Prompt and output schema for one task. Counts are bounded by the free positions on the sheet. */
export function buildRequest(t: AiTask): { prompt: string; schema: Record<string, unknown>; max: number } {
  if (t.task === 'areas') {
    const max = Math.min(8 - t.existingAreas.length, 8);
    const prompt = [
      `Goal: ${t.goalTitle}`,
      t.successCriteria ? `How the person will know they achieved it: ${t.successCriteria} (leave measurableOutcome empty)` : 'They have not written success criteria yet; put one measurable outcome they could use in measurableOutcome.',
      t.existingAreas.length ? `Key areas already on the sheet (do not repeat): ${t.existingAreas.map((a) => `"${a}"`).join(', ')}` : 'No key areas yet.',
      `Suggest up to ${max} additional key areas that cover what is missing. Each title at most 60 characters; "why" is one short sentence.`,
    ].join('\n');
    return {
      max,
      prompt,
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['measurableOutcome', 'areas'],
        properties: {
          measurableOutcome: { type: 'string' },
          areas: {
            type: 'array',
            items: { type: 'object', additionalProperties: false, required: ['title', 'why'], properties: { title: { type: 'string' }, why: { type: 'string' } } },
          },
        },
      },
    };
  }
  const max = Math.min(8 - t.existingActions.length, 8);
  const prompt = [
    `Goal: ${t.goalTitle}`,
    `Key area: ${t.areaTitle}`,
    t.existingActions.length ? `Actions already planned (do not repeat): ${t.existingActions.map((a) => `"${a}"`).join(', ')}` : 'No actions yet.',
    `Suggest up to ${max} actions for this key area. Use kind "routine" for habits (with cadence "daily" or "weekly") and "task" for one-off steps (cadence "none"). Each title at most 80 characters.`,
  ].join('\n');
  return {
    max,
    prompt,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['actions'],
      properties: {
        actions: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['title', 'kind', 'cadence'],
            properties: {
              title: { type: 'string' },
              kind: { type: 'string', enum: ['task', 'routine'] },
              cadence: { type: 'string', enum: ['daily', 'weekly', 'none'] },
            },
          },
        },
      },
    },
  };
}

/** Re-validates the model's JSON (never trusted): shapes, lengths, counts, no duplicates of existing titles. */
export function validateAiResult(t: AiTask, value: unknown, max: number): AiResult | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const seen = new Set((t.task === 'areas' ? t.existingAreas : t.existingActions).map((s) => s.toLowerCase()));
  const fresh = (title: string) => {
    const k = title.toLowerCase();
    if (!title || seen.has(k)) return false;
    seen.add(k);
    return true;
  };
  if (t.task === 'areas') {
    if (!Array.isArray(v.areas)) return null;
    const areas: AreaSuggestion[] = [];
    for (const a of v.areas) {
      if (!a || typeof a !== 'object') return null;
      const title = clean((a as Record<string, unknown>).title, 120);
      if (fresh(title)) areas.push({ title, why: clean((a as Record<string, unknown>).why, 240) });
    }
    const outcome = clean(v.measurableOutcome, 300);
    return { task: 'areas', measurableOutcome: outcome || null, areas: areas.slice(0, max) };
  }
  if (!Array.isArray(v.actions)) return null;
  const actions: ActionSuggestion[] = [];
  for (const a of v.actions) {
    if (!a || typeof a !== 'object') return null;
    const r = a as Record<string, unknown>;
    const title = clean(r.title, 160);
    const kind = r.kind === 'routine' ? 'routine' : r.kind === 'task' ? 'task' : null;
    if (!kind) return null;
    const cadence = kind === 'routine' ? (r.cadence === 'weekly' ? 'weekly' : 'daily') : null;
    if (fresh(title)) actions.push({ title, kind, cadence });
  }
  return { task: 'actions', actions: actions.slice(0, max) };
}

export async function handleAiPlan(req: Request, deps: AiDeps): Promise<Response> {
  const origin = req.headers.get('origin');
  const cors: Record<string, string> = origin && deps.allowedOrigins?.includes(origin)
    ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type', vary: 'Origin' }
    : {};
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors } });
  const fail = (status: number, code: AiErrorCode, message: string) => json(status, { ok: false, error: { code, message } });

  if (req.method === 'OPTIONS') return new Response(null, { status: cors['access-control-allow-origin'] ? 204 : 403, headers: cors });
  if (req.method !== 'POST') return fail(405, 'VALIDATION', 'Use POST');
  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')?.[1];
  if (!token) return fail(401, 'UNAUTHENTICATED', 'Please sign in');
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return fail(413, 'VALIDATION', 'Request too large');
  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return fail(413, 'VALIDATION', 'Request too large');
    body = JSON.parse(text);
  } catch {
    return fail(400, 'VALIDATION', 'Invalid request body');
  }
  const task = parseAiTask(body);
  if (!task) return fail(400, 'VALIDATION', 'Nothing to suggest for: check the goal and the free positions on the sheet');
  if (!deps.configured) return fail(503, 'NOT_CONFIGURED', 'Planning suggestions are not available yet.');

  try {
    const user = await deps.getUser(token);
    if (!user) return fail(401, 'UNAUTHENTICATED', 'Please sign in');
    if (!(await deps.hasFeature(user.id))) return fail(402, 'UPGRADE_REQUIRED', 'Planning suggestions are part of Harada Pro.');
    if (!(await deps.consumeRequest(user.id, AI_DAILY_LIMIT))) {
      return fail(429, 'RATE_LIMITED', `You have used today's ${AI_DAILY_LIMIT} suggestions. They reset tomorrow.`);
    }
    const { prompt, schema, max } = buildRequest(task);
    const out = await deps.generate(SYSTEM_PROMPT, prompt, schema);
    if (out.kind !== 'json') {
      return fail(502, 'UNAVAILABLE', out.kind === 'refusal' ? 'No suggestions for this one. Try rephrasing the goal.' : 'The suggestions came back incomplete. Please try again.');
    }
    const result = validateAiResult(task, out.value, max);
    if (!result) return fail(502, 'UNAVAILABLE', 'The suggestions came back in an unexpected form. Please try again.');
    await deps.track?.(user.id).catch(() => undefined);
    return json(200, { ok: true, data: result });
  } catch (e) {
    deps.logError?.('ai-plan failed', e instanceof Error ? e.name : 'unknown');
    return fail(502, 'UNAVAILABLE', 'Suggestions are unavailable right now. Please try again.');
  }
}
