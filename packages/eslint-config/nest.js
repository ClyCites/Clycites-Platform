import base from './base.js';

export default [
  ...base,
  {
    rules: {
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    files: ['test/**/*.ts', '**/*.spec.ts'],
    rules: {
      // Nest's getHttpServer and Supertest response body APIs expose `any` at their integration boundary.
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
];
