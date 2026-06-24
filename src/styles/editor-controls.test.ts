// @ts-expect-error Vitest runs this stylesheet regression in Node; the renderer tsconfig intentionally omits Node module types.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readStyle = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8') as string
const readSource = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8') as string

describe('editor playground baseline styles', () => {
  const mainSource = readSource('../main.tsx')
  const appWorkspacePanelsSource = readSource('../app/AppWorkspacePanels.tsx')
  const markdownEditorSource = readSource('../components/MarkdownEditor.tsx')
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

  it('moves the fixed Milkdown drop cursor into the viewport coordinate root', () => {
    expect(playgroundControllerSource).toContain('relocateFixedDropIndicatorToViewportRoot')
    expect(playgroundControllerSource).toContain('document.body.appendChild(indicator)')
    expect(playgroundControllerSource).toContain(
      "indicator.dataset.marklabPlaygroundOverlay = 'drop-cursor'",
    )
    expect(playgroundStyles).toContain(
      "body > .milkdown-drop-indicator.crepe-drop-cursor[data-marklab-playground-overlay='drop-cursor']",
    )
    expect(playgroundStyles).not.toContain('.milkdown .crepe-drop-cursor')
  })

  it('scopes local playground overrides to the active editor root', () => {
    expect(markdownEditorSource).toContain('crepe crepe-playground')
    expect(playgroundStyles).toContain('.crepe-playground .milkdown')
    expect(playgroundStyles).not.toContain('.crepe .milkdown')
    expect(playgroundStyles).not.toMatch(/(^|\n)\.milkdown \*/)
  })

  it('copies the official single-column crepe layout and color tokens', () => {
    expect(playgroundStyles).toContain('.crepe-playground > .milkdown > .ProseMirror')
    expect(playgroundStyles).toContain('--crepe-color-background: #fdfcff;')
    expect(playgroundStyles).toContain('--crepe-color-primary: #37618e;')
    expect(playgroundStyles).toContain('--crepe-color-background: #1b1c1d;')
    expect(playgroundStyles).toContain('overflow-y: scroll;')
    expect(playgroundStyles).toContain('padding: 60px 120px !important;')
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
    expect(playgroundStyles).not.toContain('hsl(var(--primary))')
  })

  it('keeps the legacy custom editor styles available but inactive', () => {
    expect(legacyEditorStyles).toContain('marklab-md-block')
    expect(legacyControlStyles).toContain("@use './editor-controls/tokens'")
  })
})
