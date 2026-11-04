module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  moduleNameMapper: {
    '^@virtual-cafe/shared$': '<rootDir>/../../packages/shared/dist/index.js',
  },
};
