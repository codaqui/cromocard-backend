import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/', 'coverage/', 'node_modules/', 'src/generated/', 'database/migrations/'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.mjs'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-console': 'error',
      'no-else-return': 'error',
      'max-depth': ['error', 1],
      'max-params': ['error', 3],
      'max-lines-per-function': ['error', { max: 25, skipBlankLines: true }],
      'no-restricted-properties': [
        'error',
        { object: 'process', property: 'env', message: 'Use `env` de "@/config/env".' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/domains/**/*.repository'],
              message: 'Use a service exportada pelo .module.ts do outro domínio.',
            },
            { group: ['../*'], message: 'Use o alias "@/".' },
          ],
        },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/config/env.ts', 'prisma.config.ts', 'vitest.config.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },
  {
    files: ['src/shared/errors/error-handler.ts'],
    rules: { 'max-params': 'off' },
  },
  {
    files: ['**/*.spec.ts'],
    rules: { 'max-lines-per-function': 'off' },
  },
  {
    files: ['eslint.config.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
);
