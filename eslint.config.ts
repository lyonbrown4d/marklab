import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import prettier from 'eslint-config-prettier'

const maxLinesOptions = {
  max: 300,
  skipBlankLines: true,
  skipComments: true,
}

const legacyOversizedFiles: string[] = [
  'src/app/AppLayout.tsx',
  'src/app/useEditorBuffer.ts',
  'src/components/TabsBar.tsx',
  'src/components/Titlebar.tsx',
  'src/components/milkdown/assetEvents.ts',
  'src/components/milkdown/useMarkdownCrepeController.ts',
  'src/components/ui/sidebar.tsx',
  'src/components/useRightSidebarData.ts',
  'src/i18n/resources.ts',
  'src/logic/markdownBlocks.ts',
  'src/services/fsApi.ts',
]

export default defineConfig([
  globalIgnores(['dist', 'dist-electron', 'node_modules', 'target']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      prettier,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      'max-lines': ['error', maxLinesOptions],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'FunctionDeclaration:not([declare=true])',
          message: 'Use an arrow function assigned to a const instead of a function declaration.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['./*', '../*'],
              message: 'Use @ or @electron path aliases instead of relative TypeScript imports.',
            },
          ],
        },
      ],
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: legacyOversizedFiles,
    rules: {
      'max-lines': 'off',
    },
  },
  {
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
])
