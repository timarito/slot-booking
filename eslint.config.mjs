// Single ESLint flat config for the whole monorepo. Each workspace gets its own block
// (apps/web will add React rules here in its scaffolding task).
// Docs: https://eslint.org/docs/latest/use/configure/configuration-files
//       https://typescript-eslint.io/getting-started/typed-linting
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // Build output and generated code are not ours to lint.
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', 'apps/api/src/generated/**'],
  },

  js.configs.recommended,

  // "Type-checked" presets use the TypeScript compiler, not just syntax. They catch bugs plain
  // linting can't see, e.g. a forgotten `await` (no-floating-promises) — on a server that means
  // an unhandled rejection or a response sent before the DB write finished.
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // Finds the nearest tsconfig.json for every file automatically.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    files: ['apps/api/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      // Leading underscore marks an intentionally unused parameter (e.g. in interface implementations).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Plain JS config files (like this one) are not part of any tsconfig — lint them without types.
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  // Must be last: turns off every stylistic rule that would fight with Prettier.
  // Formatting is Prettier's job, ESLint only looks for bugs and bad patterns.
  prettier,
);
