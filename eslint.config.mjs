// ESLint flat config for CivicPulse — catches real bugs without fighting style.
// Prettier owns formatting; ESLint owns correctness. Single-language parser
// (typescript-eslint) handles both .js/.jsx and .ts/.tsx so one flat config
// covers the whole repo.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default [
  {
    ignores: [
      'dist/',
      'node_modules/',
      'playwright-report/',
      'test-results/',
      '.llm-cache/',
      'public/data/',
      'bot/node_modules/',
      'bot/data/',
      'coverage/',
      'docs/ARCHIVE/',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: [
      'src/**/*.{js,jsx,ts,tsx,mjs}',
      'scripts/**/*.{js,jsx,ts,mjs}',
      'bot/src/**/*.{ts,tsx}',
      'bot/tests/**/*.{ts,tsx}',
    ],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2023,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: '18' } },
    rules: {
      'react/jsx-uses-react': 'off',
      'react/jsx-uses-vars': 'error',
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/no-unescaped-entities': 'off',
      'react/display-name': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-unused-vars': 'off',                        // TS handles this better
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true, caughtErrors: 'none' },
      ],
      '@typescript-eslint/no-explicit-any': 'off',    // used intentionally at a few LLM/IO boundaries
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-case-declarations': 'off',
      'no-prototype-builtins': 'off',
      'no-constant-binary-expression': 'warn',
      'no-useless-escape': 'warn',
    },
  },

  {
    files: ['tests/**/*', 'bot/tests/**/*', '**/*.test.{js,ts,jsx,tsx}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser, ...globals.es2023 },
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      // NOT a relaxation for tests — the opposite. `no-explicit-any` is already
      // 'off' for src/, scripts/, bot/src/ and bot/tests/ in the block above;
      // `tests/` was simply never in a block that set it, so it inherited
      // 'error' from tseslint's recommended set. That inconsistency is what
      // kept `npm run lint` scoped away from tests/ — and an unlinted tests/ is
      // how a test making a live network call on every run survived. Making the
      // rule uniform is the price of putting tests under the gate at all.
      // If you want to tighten `any`, tighten it repo-wide, not here alone.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
]
