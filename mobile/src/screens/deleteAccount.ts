import { errorMessage } from '@/data/errors';
import { getSupabase } from '@/data/supabase';
import { fail, type Result } from '@shared/application/result';

const unavailable = () => fail('UNAVAILABLE', errorMessage({ code: 'UNAVAILABLE', message: '' }));

function isResult(v: unknown): v is Result<null> {
  return typeof v === 'object' && v !== null && typeof (v as { ok?: unknown }).ok === 'boolean';
}

/**
 * Calls the delete-account Edge Function (docs/API_CONTRACTS.md). The function answers with the
 * app Result shape; non-2xx replies reach supabase-js as FunctionsHttpError whose `context` is the
 * Response, so the Result is read from there.
 */
export async function deleteAccount(password: string, confirmation: string): Promise<Result<null>> {
  try {
    const { data, error } = await getSupabase().functions.invoke('delete-account', {
      body: { password, confirmation },
    });
    if (!error) return isResult(data) ? data : unavailable();
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const body: unknown = await context.json();
        if (isResult(body)) return body;
      } catch {
        // fall through
      }
      return fail('INTERNAL', 'Something went wrong. Your account was not deleted — please try again.');
    }
    return unavailable();
  } catch {
    return unavailable();
  }
}
