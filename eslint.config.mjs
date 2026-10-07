import { FlatCompat } from '@eslint/eslintrc';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const restrict = (patterns) => ['error', { patterns }];

const config = [
  {
    ignores: [
      'legacy/**',
      '.next/**',
      'node_modules/**',
      '.data/**',
      'drizzle/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  // ---- Architectural boundaries (see docs/ARCHITECTURE.md) ----
  {
    files: ['src/domain/**'],
    rules: {
      'no-restricted-imports': restrict([
        { group: ['@/application/*', '@/infrastructure/*', '@/app/*', '@/ui/*', 'next', 'next/*', 'react', 'react-dom', 'drizzle-orm', 'drizzle-orm/*', 'zod', 'postgres', '@electric-sql/*'], message: 'Domain must be pure TypeScript with no framework/infrastructure imports.' },
      ]),
    },
  },
  {
    files: ['src/application/**'],
    rules: {
      'no-restricted-imports': restrict([
        { group: ['@/infrastructure/*', '@/app/*', '@/ui/*', 'next', 'next/*', 'react', 'react-dom', 'drizzle-orm', 'drizzle-orm/*', 'postgres', '@electric-sql/*'], message: 'Application layer depends only on domain + its own ports.' },
      ]),
    },
  },
  {
    files: ['src/infrastructure/**'],
    rules: {
      'no-restricted-imports': restrict([
        { group: ['@/app/*', '@/ui/*', 'react', 'react-dom'], message: 'Infrastructure must not depend on UI.' },
      ]),
    },
  },
  {
    files: ['src/ui/**'],
    rules: {
      'no-restricted-imports': restrict([
        { group: ['@/infrastructure/*', 'drizzle-orm', 'drizzle-orm/*', 'postgres', '@electric-sql/*'], message: 'UI must not touch infrastructure; go through server actions/queries.' },
      ]),
    },
  },
];

export default config;
