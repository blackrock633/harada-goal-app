import { expect, test, describe } from 'vitest';
import { TEMPLATES, instantiateTemplate } from './templates.js';
import { Instant } from './types.js';

describe('templates', () => {
  test('instantiateTemplate marathon', () => {
    let i = 0;
    const ctx = {
      ownerId: 'u1',
      ids: () => `id-${++i}`,
      today: '2024-01-01',
      now: new Date() as Instant
    };
    const { goal, outcomes, actions } = instantiateTemplate('marathon', ctx);

    expect(goal.title).toBe('Finish the City Marathon');
    expect(goal.status).toBe('draft');
    expect(outcomes.length).toBe(2);
    expect(actions.length).toBe(6);

    const firstOutcome = outcomes.find(o => o.title === 'Endurance Base');
    expect(firstOutcome).toBeDefined();
    
    const outcomeActions = actions.filter(a => a.outcomeId === firstOutcome!.id);
    expect(outcomeActions.length).toBe(3);
    expect(outcomeActions.find(a => a.title === 'Weekly long run')).toBeDefined();
  });

  test('all templates valid', () => {
    TEMPLATES.forEach(t => {
      let i = 0;
      const ctx = {
        ownerId: 'u1',
        ids: () => `id-${++i}`,
        today: '2024-01-01',
        now: new Date() as Instant
      };
      expect(() => instantiateTemplate(t.id, ctx)).not.toThrow();
    });
  });
});
