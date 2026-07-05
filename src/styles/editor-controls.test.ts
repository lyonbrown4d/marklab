// @ts-expect-error Vitest runs this stylesheet regression in Node; the renderer tsconfig intentionally omits Node module types.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readStyle = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8') as string
const readSource = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8') as string

describe('editor playground baseline styles', () => {
  const mainSource = readSource('../main.tsx')
  const appWorkspacePanelsSource = readSource('../app/AppWorkspacePanels.tsx')
  const markdownEditorSource = readSource('../components/MarkdownEditor.tsx')
  const markdownSafePluginsSource = readSource('../components/milkdown/markdownSafePlugins.ts')
  const animatedCursorSource = readSource('../components/milkdown/animatedCursorPlugin.ts')
  const playgroundControllerSource = readSource(
    '../components/milkdown/useMarkdownPlaygroundController.ts',
  )
  const wysiwygSource = readSource('../pages/WysiwygEditorPage.tsx')
  const playgroundStyles = readStyle('./editor-playground.scss')
  const appWindowStyles = readStyle('./app/_window.scss')
  const legacyEditorStyles = readStyle('./editor.scss')
  const legacyControlStyles = readStyle('./editor-controls.scss')

  it('loads only the playground baseline editor stylesheet at runtime', () => {
    expect(mainSource).toContain("import '@/styles/editor-playground.scss'")
    expect(mainSource).not.toContain("import '@/styles/editor.scss'")
    expect(mainSource).not.toContain("import '@/styles/editor-controls.scss'")
  })

  it('renders the wysiwyg editor without app shell or route cache motion transforms', () => {
    expect(wysiwygSource).not.toContain('editor-stage')
    expect(wysiwygSource).not.toContain('editor-paper')
    expect(wysiwygSource).not.toContain('motion-view')
    expect(appWorkspacePanelsSource).toContain("state.viewMode !== 'wysiwyg'")
    expect(appWorkspacePanelsSource).toContain("shouldAnimateRouteCache && 'motion-view'")
    expect(appWorkspacePanelsSource).toContain("shouldAnimateRouteCache && 'motion-view-stack'")
  })

  it('moves fixed Milkdown overlays into the viewport coordinate root', () => {
    expect(playgroundControllerSource).toContain('relocateFixedDropIndicatorToViewportRoot')
    expect(playgroundControllerSource).toContain('document.body.appendChild(indicator)')
    expect(playgroundControllerSource).toContain('.use(animatedCursor)')
    expect(playgroundControllerSource).toContain(
      "indicator.dataset.marklabPlaygroundOverlay = 'drop-cursor'",
    )
    expect(animatedCursorSource).toContain('document.body.appendChild(caret)')
    expect(animatedCursorSource).toContain(
      "caret.dataset.marklabPlaygroundOverlay = 'animated-cursor'",
    )
    expect(animatedCursorSource).toContain("view.dom.closest<HTMLElement>('.milkdown')")
    expect(playgroundStyles).toContain(
      "body > .milkdown-drop-indicator.crepe-drop-cursor[data-marklab-playground-overlay='drop-cursor']",
    )
    expect(playgroundStyles).toContain(
      "body > .marklab-animated-caret[data-marklab-playground-overlay='animated-cursor']",
    )
    expect(playgroundStyles).not.toContain('.milkdown .crepe-drop-cursor')
  })

  it('restores safe Markdown playground features without restoring legacy drag chrome', () => {
    expect(playgroundControllerSource).toContain('createMarkdownPlaygroundSlashConfig')
    expect(playgroundControllerSource).toContain('[Crepe.Feature.BlockEdit]')
    expect(playgroundControllerSource).toContain('[Crepe.Feature.Placeholder]')
    expect(playgroundControllerSource).toContain('mermaidCodeBlockConfig')
    expect(playgroundControllerSource).toContain('createMarkdownSafePlugins')
    expect(playgroundControllerSource).toContain('.use(typewriterScroll)')
    expect(playgroundControllerSource).not.toContain('embeddedPreviewPlugin')
    expect(markdownSafePluginsSource).toContain('embeddedPreviewPlugin')
    expect(markdownSafePluginsSource).not.toContain('pdfPreviewPlugin')
    expect(markdownSafePluginsSource).not.toContain('mediaPreviewPlugin')
    expect(playgroundControllerSource).not.toContain('createMarkdownImageNodeView')
  })

  it('scopes local playground overrides to the active editor root', () => {
    expect(markdownEditorSource).toContain('crepe crepe-playground')
    expect(playgroundStyles).toContain('.crepe-playground .milkdown')
    expect(playgroundStyles).not.toContain('.crepe .milkdown')
    expect(playgroundStyles).not.toMatch(/(^|\n)\.milkdown \*/)
  })

  it('maps Crepe colors to MarkLab theme tokens without changing playground layout', () => {
    expect(playgroundStyles).toContain('.crepe-playground > .milkdown > .ProseMirror')
    expect(playgroundStyles).toContain('--crepe-color-background: hsl(var(--background));')
    expect(playgroundStyles).toContain('--crepe-color-on-background: hsl(var(--foreground));')
    expect(playgroundStyles).toContain('--crepe-color-primary: hsl(var(--primary));')
    expect(playgroundStyles).toContain('--crepe-color-hover: color-mix(in srgb, hsl(var(--accent))')
    expect(playgroundStyles).toContain('overflow-y: scroll;')
    expect(playgroundStyles).toContain('padding: 60px 120px !important;')
    expect(playgroundStyles).not.toContain('#fdfcff')
    expect(playgroundStyles).not.toContain('#37618e')
    expect(playgroundStyles).not.toContain('.dark .crepe-playground .milkdown')
  })

  it('does not include right-panel or doc-page playground styles in the single-column baseline', () => {
    expect(playgroundStyles).not.toContain('playground-cm')
    expect(playgroundStyles).not.toContain('crepe-doc')
    expect(appWindowStyles).not.toContain('playground-cm')
  })

  it('does not include Marklab editor interaction overrides in the playground baseline', () => {
    expect(playgroundStyles).not.toContain('marklab-md-block')
    expect(playgroundStyles).not.toContain('marklab-editor-drop-indicator')
    expect(playgroundStyles).not.toContain('ProseMirror-hideselection')
    expect(playgroundStyles).not.toContain('milkdown-block-handle')
    expect(playgroundStyles).not.toContain('data-editor-dragging')
  })

  it('keeps the legacy custom editor styles available but inactive', () => {
    expect(legacyEditorStyles).toContain('marklab-md-block')
    expect(legacyControlStyles).toContain("@use './editor-controls/tokens'")
  })
})
