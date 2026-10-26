import { describe, expect, it, vi } from 'vitest';
import { buildRequest, handleAiPlan, parseAiTask, validateAiResult, type AiDeps } from '../../../supabase/functions/_shared/ai-plan';

/** Logic of the ai-plan Edge Function with Supabase and the model mocked (the Deno wiring is untested here). */
const USER = { id: '11111111-1111-4111-8111-111111111111' };

function deps(over: Partial<AiDeps> = {}): AiDeps {
  return {
    configured: true,
    getUser: vi.fn(async (t: string) => (t === 'good' ? USER : null)),
    hasFeature: vi.fn(async () => true),
    consumeRequest: vi.fn(async () => true),
    generate: vi.fn(async () => ({
      kind: 'json' as const,
      value: { measurableOutcome: 'Run 42 km by May', areas: [{ title: 'Endurance', why: 'Base fitness.' }, { title: 'Sleep', why: 'Recovery.' }] },
    })),
    track: vi.fn(async () => {}),
    ...over,
  };
}
const post = (body: unknown, token: string | null = 'good') =>
  new Request('https://x/functions/v1/ai-plan', { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body) });
const AREAS = { task: 'areas', goalTitle: 'Run a marathon', successCriteria: '', existingAreas: ['Sleep'] };

describe('ai-plan', () => {
  it('returns validated suggestions and drops ones already on the sheet', async () => {
    const d = deps();
    const res = await handleAiPlan(post(AREAS), d);
    expect(await res.json()).toEqual({ ok: true, data: { task: 'areas', measurableOutcome: 'Run 42 km by May', areas: [{ title: 'Endurance', why: 'Base fitness.' }] } });
    const [, prompt] = (d.generate as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(prompt).toContain('Run a marathon');
    expect(prompt).toContain('"Sleep"');
    expect(d.track).toHaveBeenCalledWith(USER.id);
  });

  it('sends only what is being planned: no extra fields from the body reach the prompt', async () => {
    const d = deps();
    await handleAiPlan(post({ ...AREAS, reflections: 'very private', notes: 'secret' }), d);
    const [system, prompt] = (d.generate as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(`${system}${prompt}`).not.toMatch(/private|secret/);
  });

  it('is Pro only, rate limited, and honest when unconfigured', async () => {
    expect((await handleAiPlan(post(AREAS), deps({ hasFeature: vi.fn(async () => false) }))).status).toBe(402);
    const limited = await handleAiPlan(post(AREAS), deps({ consumeRequest: vi.fn(async () => false) }));
    expect(limited.status).toBe(429);
    const d = deps({ configured: false });
    expect((await handleAiPlan(post(AREAS), d)).status).toBe(503);
    expect(d.generate).not.toHaveBeenCalled();
    expect((await handleAiPlan(post(AREAS, null), deps())).status).toBe(401);
    expect((await handleAiPlan(post(AREAS, 'bad'), deps())).status).toBe(401);
  });

  it('never passes on malformed, refused or truncated model output', async () => {
    for (const out of [
      { kind: 'json' as const, value: { areas: 'not a list' } },
      { kind: 'json' as const, value: null },
      { kind: 'refusal' as const },
      { kind: 'truncated' as const },
    ]) {
      const res = await handleAiPlan(post(AREAS), deps({ generate: vi.fn(async () => out) }));
      expect(res.status).toBe(502);
      expect((await res.json()).ok).toBe(false);
    }
    const res = await handleAiPlan(post(AREAS), deps({ generate: vi.fn(async () => { throw new Error('timeout'); }) }));
    expect(res.status).toBe(502);
  });

  it('rejects bad requests: unknown task, full sheet, oversized lists', () => {
    expect(parseAiTask({ task: 'essay', goalTitle: 'x' })).toBeNull();
    expect(parseAiTask({ task: 'areas', goalTitle: '' })).toBeNull();
    expect(parseAiTask({ task: 'areas', goalTitle: 'x', existingAreas: Array(8).fill('a') })).toBeNull();
    expect(parseAiTask({ task: 'actions', goalTitle: 'x', areaTitle: 'y', existingActions: Array(9).fill('a') })).toBeNull();
    expect(parseAiTask({ task: 'actions', goalTitle: 'x', areaTitle: 'y', existingActions: [1] })).toBeNull();
  });

  it('caps suggestions at the free positions and normalises action cadence', () => {
    const t = parseAiTask({ task: 'actions', goalTitle: 'Learn Spanish', areaTitle: 'Speaking', existingActions: Array(6).fill(0).map((_, i) => `a${i}`) })!;
    const { max, prompt } = buildRequest(t);
    expect(max).toBe(2);
    expect(prompt).toContain('up to 2');
    const r = validateAiResult(t, { actions: [
      { title: 'Book a tutor', kind: 'task', cadence: 'daily' },
      { title: 'Shadow a podcast', kind: 'routine', cadence: 'weekly' },
      { title: 'Third', kind: 'routine', cadence: 'none' },
    ] }, max);
    expect(r).toEqual({ task: 'actions', actions: [
      { title: 'Book a tutor', kind: 'task', cadence: null },
      { title: 'Shadow a podcast', kind: 'routine', cadence: 'weekly' },
    ] });
    expect(validateAiResult(t, { actions: [{ title: 'x', kind: 'sometimes' }] }, max)).toBeNull();
  });
});
