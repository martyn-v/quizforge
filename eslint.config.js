import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'server/src/generated/**',
      'server/prisma/migrations/**',
      'web/dist/**',
    ],
  },

  js.configs.recommended,

  // Type-aware rules for the server and shared packages. These are the ones
  // worth having here: a floating promise in a Nest factory or a graph node
  // fails silently rather than crashing, which is the hardest kind to spot.
  {
    files: ['server/**/*.ts', 'shared/**/*.ts'],
    extends: [
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Nest constructor injection relies on parameter properties.
      '@typescript-eslint/no-empty-function': [
        'error',
        { allow: ['constructors'] },
      ],
      // Leading underscore is the escape hatch for deliberate placeholders,
      // e.g. the llm argument the graph builder does not use yet.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // The spike is a throwaway verification script, not production code.
  {
    files: ['server/spike/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      'no-console': 'off',
    },
  },

  // Vue SFCs: syntax-only, no type-aware rules across template boundaries.
  ...vue.configs['flat/recommended'],
  {
    files: ['web/**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      // Pure formatting, and nothing here formats Vue templates consistently.
      // Off so template layout noise cannot bury a real finding.
      'vue/max-attributes-per-line': 'off',
      'vue/html-self-closing': 'off',
      'vue/singleline-html-element-content-newline': 'off',
    },
  },
);
