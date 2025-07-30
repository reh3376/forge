module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.e2e.spec.ts'],
  moduleNameMapper: {
    '@app/custom-validators': '<rootDir>/src/validators'
  },
  modulePathIgnorePatterns: [
    '<rootDir>/dist/'
  ],
  setupFilesAfterEnv: ['<rootDir>/src/test-setup-e2e.ts'],
  testTimeout: 30000, // E2E tests may take longer
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.e2e.spec.ts',
    '!src/**/base/**',
    '!src/main.ts'
  ]
};