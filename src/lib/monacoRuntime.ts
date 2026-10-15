// Monaco's root entry also imports the LSP client. Keep the official lazy
// language registrations and every editor contribution without that client.
import 'monaco-editor/features/register.all.js'
import 'monaco-editor/editor/browser/coreCommands.js'
import 'monaco-editor/editor/contrib/caretOperations/browser/caretOperations.js'
import 'monaco-editor/editor/contrib/dropOrPasteInto/browser/copyPasteContribution.js'
import 'monaco-editor/editor/contrib/find/browser/findController.js'
import 'monaco-editor/editor/contrib/gotoSymbol/browser/goToCommands.js'
import 'monaco-editor/editor/contrib/gotoError/browser/markerSelectionStatus.js'
import 'monaco-editor/editor/contrib/semanticTokens/browser/documentSemanticTokens.js'
import 'monaco-editor/editor/contrib/suggest/browser/suggestController.js'
import 'monaco-editor/editor/common/standaloneStrings.js'

export * from 'monaco-editor/editor/editor.api.js'
export { css, html, json, typescript } from 'monaco-editor/languages/register.all.js'
