import eslint from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
      globals: { window: 'readonly', document: 'readonly', HTMLElement: 'readonly', HTMLCanvasElement: 'readonly' }
    },
    rules: { 'svelte/no-dom-manipulating': 'off' }
  }
);
