/**
 * Moved to src/application/matrix.ts (DUP-01) so web and native share one Harada matrix model.
 * This re-export only keeps existing importers (QA's tests/integration/matrix-structure.test.ts)
 * compiling; import '@/application/matrix' instead. Delete once nothing imports this path.
 */
export * from '@/application/matrix';
