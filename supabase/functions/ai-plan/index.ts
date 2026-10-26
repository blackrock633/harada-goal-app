// Supabase Edge Function (Deno): planning suggestions for Harada Pro. Deploy: `supabase functions deploy ai-plan`.
// Secrets: ANTHROPIC_API_KEY (unset: the function answers NOT_CONFIGURED), optional ALLOWED_ORIGINS. Keep JWT
// verification on. Not type-checked by the app's tsc; the logic lives in ../_shared/ai-plan.ts (unit-tested).
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js@2.109.0';
import { handleAiPlan } from '../_shared/ai-plan.ts';

const apiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const client = apiKey ? new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 }) : null;
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve((req: Request) =>
  handleAiPlan(req, {
    configured: client !== null,
    async getUser(token) {
      const { data, error } = await admin.auth.getUser(token);
      return error || !data.user ? null : { id: data.user.id };
    },
    async hasFeature(userId) {
      const { data, error } = await admin.rpc('user_has_feature', { p_user: userId, p_feature: 'ai_planning' });
      if (error) throw error;
      return data === true;
    },
    async consumeRequest(userId, limit) {
      const { data, error } = await admin.rpc('consume_ai_request', { p_user: userId, p_limit: limit });
      if (error) throw error;
      return data === true;
    },
    async generate(system, prompt, schema) {
      // Short structured answer: low effort is enough. `fallbacks: "default"` lets the API re-run a
      // safety-declined request on Anthropic's recommended fallback model instead of returning the refusal.
      const response = await client!.beta.messages.create({
        model: 'claude-opus-5-5',
        max_tokens: 8000,
        betas: ['server-side-fallback-2026-07-01'],
        // @ts-expect-error: the "default" fallback form may be newer than the SDK typings
        fallbacks: 'default',
        output_config: { effort: 'low', format: { type: 'json_schema', schema } },
        system,
        messages: [{ role: 'user', content: prompt }],
      });
      if (response.stop_reason === 'refusal') return { kind: 'refusal' };
      if (response.stop_reason === 'max_tokens') return { kind: 'truncated' };
      const text = response.content.find((b) => b.type === 'text');
      if (!text || text.type !== 'text') return { kind: 'truncated' };
      try {
        return { kind: 'json', value: JSON.parse(text.text) };
      } catch {
        return { kind: 'truncated' };
      }
    },
    async track(userId) {
      await admin.from('analytics_events').insert({ name: 'premium_feature_used', user_id: userId, props: { feature: 'ai_planning' } });
    },
    logError(message, detail) {
      // Never log the goal text: only the error class.
      console.error(message, detail);
    },
    allowedOrigins: (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((o) => o.trim()).filter(Boolean),
  }),
);
