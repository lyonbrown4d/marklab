import type { editor } from 'monaco-editor'

// Typing edits the document; only Tab or a click accepts a suggestion.
export const monacoSuggestionOptions = {
  acceptSuggestionOnCommitCharacter: false,
  acceptSuggestionOnEnter: 'off',
  autoClosingBrackets: 'never',
  autoClosingComments: 'never',
  autoClosingQuotes: 'never',
  autoClosingOvertype: 'never',
  autoSurround: 'never',
  inlineSuggest: { enabled: false },
  tabCompletion: 'off',
  suggest: { preview: false, showInlineDetails: true },
} satisfies editor.IStandaloneEditorConstructionOptions
