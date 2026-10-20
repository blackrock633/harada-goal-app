import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    include: ['src/**/*.test.{ts,tsx}', 'tests/integration/**/*.test.ts'],
    exclude: ['node_modules', 'legacy', 'tests/e2e'],
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
