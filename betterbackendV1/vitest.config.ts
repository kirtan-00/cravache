import { defineConfig } from 'vitest/config';

// Unit tests for the pure engine/logic modules in src/. As game systems are
// migrated from public/js/ into typed src/ modules, their pure math (economy,
// chaos decay, verdict odds) becomes testable here.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
  },
});
