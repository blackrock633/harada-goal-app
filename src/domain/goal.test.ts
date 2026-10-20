import { expect, test, describe } from 'vitest';
import { createGoal, updateGoalDetails, activateGoal, markGoalAchieved, reopenGoal, archiveGoal, restoreGoal, assertGoalEditable, assertPermanentDeleteAllowed } from './goal.js';
import { Goal, Instant } from './types.js';

describe('goal', () => {
  const now = new Date() as Instant;

  test('createGoal', () => {
    const goal = createGoal({ id: 'g1', ownerId: 'u1', title: '  My Goal  ' }, now);
    expect(goal.title).toBe('My Goal');
    expect(goal.status).toBe('draft');
  });

  test('createGoal empty title throws', () => {
    expect(() => createGoal({ id: 'g1', ownerId: 'u1', title: '   ' }, now)).toThrowError(/Title cannot be empty/);
  });

  test('updateGoalDetails', () => {
    let goal = createGoal({ id: 'g1', ownerId: 'u1', title: 'My Goal' }, now);
    const { goal: next, changed } = updateGoalDetails(goal, { title: 'New Title', purpose: { selfTangible: 'Money' } }, now);
    expect(next.title).toBe('New Title');
    expect(next.purpose.selfTangible).toBe('Money');
    expect(changed).toContain('title');
    expect(changed).toContain('purpose');
  });

  test('activateGoal', () => {
    let goal = createGoal({ id: 'g1', ownerId: 'u1', title: 'My Goal' }, now);
    expect(() => activateGoal(goal, { activeOutcomes: 0, activeActions: 0 }, '2024-01-01', now)).toThrowError(/must have at least 1/);
    goal = activateGoal(goal, { activeOutcomes: 1, activeActions: 1 }, '2024-01-01', now);
    expect(goal.status).toBe('active');
    expect(goal.activatedOn).toBe('2024-01-01');
  });

  test('markGoalAchieved and reopen', () => {
    let goal = createGoal({ id: 'g1', ownerId: 'u1', title: 'My Goal' }, now);
    goal = activateGoal(goal, { activeOutcomes: 1, activeActions: 1 }, '2024-01-01', now);
    
    goal = markGoalAchieved(goal, now);
    expect(goal.status).toBe('achieved');
    
    goal = reopenGoal(goal, now);
    expect(goal.status).toBe('active');
  });

  test('archive and restore', () => {
    let goal = createGoal({ id: 'g1', ownerId: 'u1', title: 'My Goal' }, now);
    goal = activateGoal(goal, { activeOutcomes: 1, activeActions: 1 }, '2024-01-01', now);
    
    goal = archiveGoal(goal, now);
    expect(goal.status).toBe('archived');
    expect(goal.statusBeforeArchive).toBe('active');
    
    expect(() => updateGoalDetails(goal, { title: 'foo' }, now)).toThrowError(/Cannot edit archived/);
    
    goal = restoreGoal(goal, now);
    expect(goal.status).toBe('active');
  });

  test('delete rules', () => {
    const goal = createGoal({ id: 'g1', ownerId: 'u1', title: 'My Goal' }, now);
    expect(() => assertPermanentDeleteAllowed(goal, 'My Goal')).toThrowError(/Only archived/);
    
    const archived = archiveGoal(goal, now);
    expect(() => assertPermanentDeleteAllowed(archived, 'Wrong Title')).toThrowError(/Title confirmation does not match/);
    expect(() => assertPermanentDeleteAllowed(archived, 'My Goal')).not.toThrow();
  });
});
