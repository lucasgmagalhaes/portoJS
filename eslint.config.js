import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const ALLOWED_DIRECTIVES =
  /^ *(eslint-|@vitest-environment|@ts-(expect-error|ignore|nocheck)|istanbul|v8 ignore)/;

/**
 * Local rule: the only comments allowed are JSDoc blocks, which document the public API, and
 * tool directives. Plain line comments and plain block comments are rejected.
 */
const noPlainComments = {
  meta: {
    type: 'suggestion',
    schema: [],
    messages: {
      singleLine:
        'JSDoc blocks must span several lines: put the text between the /** and */ lines.',
      plain:
        'Plain comments are not allowed. Express intent with names and types, or use a JSDoc block.',
    },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (comment.type === 'Shebang') continue;
          if (comment.type === 'Block' && comment.value.startsWith('*')) {
            if (comment.loc.start.line === comment.loc.end.line) {
              context.report({ loc: comment.loc, messageId: 'singleLine' });
            }
            continue;
          }
          if (ALLOWED_DIRECTIVES.test(comment.value)) continue;
          context.report({ loc: comment.loc, messageId: 'plain' });
        }
      },
    };
  },
};

const TYPED_FILES = [
  'packages/*/src/**/*.{ts,tsx}',
  'packages/*/test/**/*.{ts,tsx}',
  'bench/**/*.ts',
  'e2e/**/*.ts',
];

const INLINE_FUNCTION_MESSAGE =
  'Inline functions are not allowed in library code. Declare a named function or a const and pass it by name.';

export default tseslint.config(
  {
    ignores: [
      '**/dist',
      '**/temp',
      'node_modules',
      'examples/**/dist',
      'coverage',
      'docs/api',
      'docs/.vitepress/dist',
      'docs/.vitepress/cache',
      'playwright-report',
      'test-results',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: TYPED_FILES,
  })),
  {
    files: TYPED_FILES,
    languageOptions: {
      parserOptions: { project: ['./tsconfig.json'], tsconfigRootDir: import.meta.dirname },
    },
    rules: { '@typescript-eslint/no-unnecessary-condition': 'error' },
  },
  {
    files: ['packages/*/test/**/*.{ts,tsx}'],
    rules: { '@typescript-eslint/unbound-method': 'off' },
  },
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    plugins: { local: { rules: { 'no-plain-comments': noPlainComments } } },
    rules: { 'local/no-plain-comments': 'error' },
  },
  {
    files: ['packages/*/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: 'CallExpression > ArrowFunctionExpression', message: INLINE_FUNCTION_MESSAGE },
        { selector: 'CallExpression > FunctionExpression', message: INLINE_FUNCTION_MESSAGE },
        { selector: 'NewExpression > ArrowFunctionExpression', message: INLINE_FUNCTION_MESSAGE },
        { selector: 'NewExpression > FunctionExpression', message: INLINE_FUNCTION_MESSAGE },
      ],
    },
  },
);
