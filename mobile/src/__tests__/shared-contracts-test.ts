import { MAX_ACTIONS_PER_OUTCOME, MAX_OUTCOMES_PER_GOAL } from '@shared/domain/limits';
import { addActionSchema } from '@shared/application/schemas';
import { addDays } from '@shared/domain/dates';

// The native app must use the SAME domain rules and input contracts as the web/API.
describe('shared domain and contracts', () => {
  it('exposes the Harada structure limits', () => {
    expect(MAX_OUTCOMES_PER_GOAL).toBe(8);
    expect(MAX_ACTIONS_PER_OUTCOME).toBe(8);
  });
  it('resolves domain modules that use .js specifiers', () => {
    expect(addDays('2026-10-19', 1)).toBe('2026-10-20');
  });
  it('validates with the shared Zod schemas', () => {
    expect(addActionSchema.safeParse({ outcomeId: 'nope', title: '', kind: 'task' }).success).toBe(false);
  });
});
