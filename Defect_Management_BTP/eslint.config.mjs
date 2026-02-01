import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
       globals: globals.browser,
       parserOptions: {
         // npm run typecheck 기준과 동일한 tsconfig 집합
         project: [
           './tsconfig.json',        // 앱(빌드용) tsconfig
           './tsconfig.node.json',   // node/vite/eslint 설정 파일용
           './tsconfig.spec.json'    // cypress/테스트용
         ],
         tsconfigRootDir: import.meta.dirname,
       },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
);
