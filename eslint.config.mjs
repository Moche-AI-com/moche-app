// Next 16 removed `next lint`, and ESLint 10 removed .eslintrc support. Both
// changes arrived in the same Dependabot bump (Next 14.2.15 -> 16.3.0), which is
// why lint went red on main: `next lint` tried to lint a directory literally
// named "lint". This flat config replaces .eslintrc.json.
//
// eslint-config-next 16 already ships a flat config array, so no FlatCompat
// bridge is needed -- spreading it directly is what the package expects.
import next from 'eslint-config-next';

export default [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
      // Vendored static asset served verbatim, not part of the build graph.
      'public/assets/**',
    ],
  },
  // Same rule set the repository had before the bump. Widening or narrowing the
  // rules while repairing the toolchain would hide real regressions in the noise
  // of a config migration.
  ...next,
  {
    // eslint-plugin-react (bundled inside eslint-config-next 16) autodetects the
    // React version via ESLint 9's context.getFilename(), which ESLint 10
    // removed -- every file then crashes the linter instead of reporting.
    // Declaring the version explicitly skips autodetection entirely.
    settings: { react: { version: '18.3' } },
  },
  {
    // eslint-plugin-react-hooks 7 (pulled in by eslint-config-next 16) added the
    // React Compiler rule family. It reports 31 findings in code that predates
    // the bump: 21 set-state-in-effect, 8 refs, 2 purity. None of them are
    // regressions from this branch, and none were ever enforced before.
    //
    // These are set to `warn`, not `off`. `off` would hide them; `error` would
    // make a toolchain repair depend on a 31-site hydration refactor across the
    // dashboard, which is exactly the kind of coupling that leaves main red for
    // weeks. They stay visible in every CI run and are tracked in
    // docs/DIRECTIVE-AMENDMENT-001.md under "Carried debt".
    //
    // Do not add new violations. Reducing this to zero should restore `error`.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
];
