import { describe, expect, it } from 'vitest';
import { addOutcomeSchema, updateMeasureCurrentSchema } from './schemas';

/** SEC-VAL-01: web validation must accept exactly what the RPC accepts (measures capped at 1e12). */
const id = '11111111-1111-4111-8111-111111111111';

describe('measure limits match the database RPCs', () => {
  it('rejects targets and current values above 1e12', () => {
    expect(addOutcomeSchema.safeParse({ goalId: id, title: 'x', measure: { target: 1e13, unit: 'km' } }).success).toBe(false);
    expect(addOutcomeSchema.safeParse({ goalId: id, title: 'x', measure: { target: 10, current: 1e300, unit: 'km' } }).success).toBe(false);
    expect(updateMeasureCurrentSchema.safeParse({ outcomeId: id, current: 1e13 }).success).toBe(false);
  });
  it('still accepts realistic values', () => {
    expect(addOutcomeSchema.safeParse({ goalId: id, title: 'x', measure: { target: 1e12, current: 5, unit: 'km' } }).success).toBe(true);
    expect(updateMeasureCurrentSchema.safeParse({ outcomeId: id, current: 42.5 }).success).toBe(true);
  });
});
