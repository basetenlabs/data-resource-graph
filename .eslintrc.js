module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  rules: {
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-restricted-imports': [
      2,
      {
        paths: [
          {
            name: 'lodash',
            message:
              "Please use `import x from 'lodash/x'`; instead of `import { x } from 'lodash'`",
          },
        ],
      },
    ],
  },
};
