import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    env: { LOG_LEVEL: 'silent' },
    // Most tests take milliseconds. Building a catalogue database takes longer on a busy machine.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
