// Supabase Edge Function (Deno). Deploy: `supabase functions deploy delete-account`.
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are injected by Supabase; the service-role
// key stays on the server. Keep JWT verification on (the default), so only signed-in callers reach this.
// Not type-checked by the app's tsc (Deno globals); the logic lives in handler.ts, which is unit-tested.
import { createClient } from 'npm:@supabase/supabase-js@2.109.0';
import { handleDeleteAccount } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, noSession);

Deno.serve((req: Request) =>
  handleDeleteAccount(req, {
    async getUser(accessToken) {
      const { data, error } = await admin.auth.getUser(accessToken);
      if (error || !data.user?.email) return null;
      return { id: data.user.id, email: data.user.email };
    },
    async verifyPassword(email, password) {
      // A throwaway client: checking the password must not touch any other session.
      const { error } = await createClient(url, anonKey, noSession).auth.signInWithPassword({ email, password });
      return !error;
    },
    async deleteUser(userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
    },
    logError(message, detail) {
      console.error(message, detail);
    },
  }),
);
