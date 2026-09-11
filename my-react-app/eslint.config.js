import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `server/` is a separate CommonJS/Node project (its own package.json,
  // no eslint of its own) — linting it with this Vite/React/browser config
  // was flooding it with false "require/module/process is not defined"
  // errors. Excluded here rather than reconfigured for Node, since it isn't
  // meant to be linted by the frontend's tooling at all.
  globalIgnores(['dist', 'server']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactRefresh.configs.vite,
    ],
    // `reactHooks.configs.flat.recommended` is deliberately NOT extended here.
    // eslint-plugin-react-hooks v7 folds the React Compiler rule set
    // (config, error-boundaries, immutability, purity, refs, set-state-in-effect,
    // static-components, ...) into that preset. React Compiler is not enabled in
    // this project (no babel-plugin-react-compiler, no compiler plugin in
    // vite.config.js), so those rules only report false positives. The two
    // classic hook rules are enabled explicitly below instead.
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
])