// Native predictions must not compete with the editor's explicit suggestion menu.
// Use the HTML spelling until React's types include writingsuggestions.
export const manualTextInputAttributes = {
  autoCapitalize: 'off',
  autoCorrect: 'off',
  writingsuggestions: 'false',
} as const
