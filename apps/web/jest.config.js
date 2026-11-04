/**
 * Mirrors apps/server's setup so the repo has one testing idiom, not two.
 *
 * Scope is deliberately pure logic — the screen-share and voice state models.
 * The LiveKit and canvas layers need a real browser and a real SFU; mocking
 * them would produce tests that pass while production breaks, so those are
 * verified with tools/visual-check.mjs against a running app instead.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  moduleNameMapper: {
    '^@virtual-cafe/shared$': '<rootDir>/../../packages/shared/dist/index.js',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
