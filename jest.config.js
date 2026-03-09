module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts'
  ],
  moduleNameMapper: {
    '^axios$': require.resolve('axios'),
    '^marked$': '<rootDir>/node_modules/marked/marked.cjs.js'
  }
};