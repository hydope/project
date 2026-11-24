module.exports = {
  env: { browser: true, es2021: true, node: true },
  extends: ['eslint:recommended', 'plugin:react/recommended'],
  parserOptions: { ecmaFeatures: { jsx: true }, ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['react'],
  rules: {
    'react/react-in-jsx-scope': 'off',
    // Demo UI kit — prop-types add noise without value; contracts land with TS later.
    'react/prop-types': 'off',
    // Apostrophes in copy are fine in JSX text.
    'react/no-unescaped-entities': 'off',
    // Named-import cleanups are tracked as warnings, not build-breakers.
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    // Declaration order is load-bearing in components: a hook dependency
    // array is evaluated during render, so reading a const above its
    // declaration throws a TDZ error on EVERY render. That exact shape
    // shipped 2026-11-16 in Profiles.jsx (an effect above the `filtered`
    // useMemo it depended on) and crashed /profiles for every visitor
    // for a day — a real member deleted his account over it. This rule
    // flags that shape at lint time. The codebase is clean under it as of
    // the 2026-11-24 Phase 5 pass (21 errors triaged and fixed), and lint
    // is a blocking step in CI and deploy — keep it clean; a red lint
    // now stops the deploy.
    'no-use-before-define': ['error', { variables: true, functions: false, classes: true }],
  },
  settings: { react: { version: 'detect' } },
};
