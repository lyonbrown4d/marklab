// Include lazy-entry dependencies before the first editor/search interaction.
// These settings do not eagerly load features in the production renderer.
export const devOptimizeDepsInclude = [
  'react',
  'react-dom',
  'react-dom/client',
  'react/jsx-runtime',
  'react-router-dom',
  '@tanstack/react-query',
  'zustand',
  'sonner',
  'lucide-react',
  '@codemirror/language-data',
  '@codemirror/language',
  '@milkdown/crepe',
  '@milkdown/kit/core',
  '@milkdown/kit/plugin/listener',
  '@milkdown/kit/preset/commonmark',
  '@milkdown/kit/prose/model',
  '@milkdown/kit/prose/state',
  '@milkdown/kit/prose/view',
  '@milkdown/kit/utils',
  '@uiw/codemirror-theme-eclipse',
  'lodash-es/escape',
  'lodash-es/throttle',
  'mermaid',
  'fuse.js',
]

export const devWarmupClientFiles = [
  './src/main.tsx',
  './src/App.tsx',
  './src/app/AppLayout.tsx',
  './src/app/AppShellPanels.tsx',
  './src/pages/WorkspaceHomePage.tsx',
  './src/components/MarkdownEditor.tsx',
  './src/components/TitlebarCommandDialog.tsx',
]
