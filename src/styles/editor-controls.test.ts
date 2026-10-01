// @ts-expect-error Vitest runs this stylesheet regression in Node; the renderer tsconfig intentionally omits Node module types.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readStyle = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8') as string
const readOptionalStyle = (file: string) => {
  const url = new URL(file, import.meta.url)
  return existsSync(url) ? (readFileSync(url, 'utf8') as string) : ''
}
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
  const playgroundFactorySource = readSource(
    '../components/milkdown/createMarkdownPlaygroundCrepe.ts',
  )
  const playgroundActionsSource = readSource('../components/milkdown/markdownPlaygroundActions.ts')
  const wysiwygSource = readSource('../pages/WysiwygEditorPage.tsx')
  const playgroundStyles = readStyle('./editor-playground.scss')
  const appWindowStyles = readStyle('./app/_window.scss')
  const appMenuMotionStyles = readStyle('./app/_menu-motion.scss')
  const legacyEditorStyles = readStyle('./editor.scss')
  const legacyControlStyles = readStyle('./editor-controls.scss')
  const sharedMenuStyles = readOptionalStyle('./shared/_menu.scss')
  const tableStyles = readOptionalStyle('./editor-playground/table.scss')
  const slashMenuStyles = readOptionalStyle('./editor-playground/slash-menu.scss')
  const selectionToolbarStyles = readOptionalStyle('./editor-playground/selection-toolbar.scss')

  it('loads only the playground baseline editor stylesheet at runtime', () => {
    expect(mainSource).toContain("import '@/styles/editor-playground.scss'")
    expect(mainSource).not.toContain("import '@/styles/editor.scss'")
    expect(mainSource).not.toContain("import '@/styles/editor-controls.scss'")
  })

  it('renders the wysiwyg editor without legacy app shell or route cache motion transforms', () => {
    expect(wysiwygSource).not.toContain('editor-stage')
    expect(wysiwygSource).not.toContain('editor-paper')
    expect(wysiwygSource).not.toContain('motion-view')
    expect(appWorkspacePanelsSource).toContain('<ImmersiveWorkspaceShell')
    expect(appWorkspacePanelsSource).not.toContain('motion-view')
    expect(appWorkspacePanelsSource).not.toContain('motion-view-stack')
  })

  it('moves fixed Milkdown overlays into the viewport coordinate root', () => {
    expect(playgroundControllerSource).toContain('relocateFixedDropIndicatorToViewportRoot')
    expect(playgroundActionsSource).toContain('document.body.appendChild(indicator)')
    expect(playgroundControllerSource).toContain('.use(animatedCursor)')
    expect(playgroundActionsSource).toContain(
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
    expect(playgroundFactorySource).toContain('createMarkdownPlaygroundSlashConfig')
    expect(playgroundFactorySource).toContain('[Crepe.Feature.BlockEdit]')
    expect(playgroundFactorySource).toContain('[Crepe.Feature.Placeholder]')
    expect(playgroundFactorySource).toContain('mermaidCodeBlockConfig')
    expect(playgroundControllerSource).toContain('createMarkdownSafePlugins')
    expect(playgroundControllerSource).toContain('.use(typewriterScroll)')
    expect(playgroundControllerSource).not.toContain('embeddedPreviewPlugin')
    expect(markdownSafePluginsSource).toContain('embeddedPreviewPlugin')
    expect(markdownSafePluginsSource).toContain('markdownTableEditingPlugin')
    expect(markdownSafePluginsSource).not.toContain('pdfPreviewPlugin')
    expect(markdownSafePluginsSource).not.toContain('mediaPreviewPlugin')
    expect(playgroundControllerSource).not.toContain('createMarkdownImageNodeView')
  })

  it('styles the table toolbar as a cell-anchored accessible overlay', () => {
    expect(playgroundStyles).toContain("@use './editor-playground/table';")
    expect(tableStyles).toContain('.marklab-table-toolbar')
    expect(tableStyles).toContain("[data-placement='above']::after")
    expect(tableStyles).toContain('--marklab-table-anchor-x')
    expect(tableStyles).toContain('max-width: calc(100% - 1rem);')
    expect(tableStyles).toContain('flex-wrap: wrap;')
    expect(tableStyles).not.toContain('overflow-x: auto;')
    expect(tableStyles).toContain('.ProseMirror table:focus-within')
    expect(tableStyles).toContain('@media (prefers-reduced-motion: reduce)')
    expect(tableStyles).toContain('border-collapse: separate;')
  })

  it('presents the slash menu with the same compact density as application menus', () => {
    expect(playgroundStyles).toContain("@use './editor-playground/slash-menu';")
    expect(slashMenuStyles).toContain('.crepe-playground .milkdown .milkdown-slash-menu')
    expect(slashMenuStyles).toContain('width: min(16rem, calc(100vw - 1rem));')
    expect(sharedMenuStyles).toContain('border-radius: 0.75rem;')
    expect(sharedMenuStyles).toContain('backdrop-filter: blur(16px)')
    expect(slashMenuStyles).toContain('.tab-group')
    expect(slashMenuStyles).toContain('position: sticky')
    expect(sharedMenuStyles).toContain('min-height: 2rem;')
    expect(sharedMenuStyles).toContain('width: 0.875rem;')
    expect(slashMenuStyles).toContain('.menu-group li svg')
    expect(slashMenuStyles).not.toContain('width: 2rem;')
    expect(slashMenuStyles).toContain('@media (max-width: 480px)')
    expect(slashMenuStyles).toContain('@media (prefers-reduced-motion: reduce)')
    expect(slashMenuStyles).not.toContain('#')
  })

  it('shares the application menu recipes with third-party editor menus', () => {
    expect(sharedMenuStyles).toContain('@mixin surface')
    expect(sharedMenuStyles).toContain('@mixin item')
    expect(sharedMenuStyles).toContain('@mixin active-item')
    expect(sharedMenuStyles).toContain('@mixin item-icon')
    expect(sharedMenuStyles).toContain('@mixin separator')
    expect(appMenuMotionStyles).toContain("@use '../shared/menu';")
    expect(appMenuMotionStyles).toContain('@include menu.surface;')
    expect(appMenuMotionStyles).toContain('@include menu.item;')
    expect(appMenuMotionStyles).toContain('@include menu.item-icon;')
    expect(slashMenuStyles).toContain("@use '../shared/menu';")
    expect(slashMenuStyles).toContain('@include menu.surface;')
    expect(slashMenuStyles).toContain('@include menu.item;')
    expect(slashMenuStyles).toContain('@include menu.item-icon;')
  })

  it('presents the selection toolbar as a compact accessible floating control', () => {
    expect(playgroundStyles).toContain("@use './editor-playground/selection-toolbar';")
    expect(selectionToolbarStyles).toContain('.crepe-playground .milkdown .milkdown-toolbar')
    expect(selectionToolbarStyles).toContain('backdrop-filter: blur(18px)')
    expect(selectionToolbarStyles).toContain('.toolbar-item.active')
    expect(selectionToolbarStyles).toContain('.toolbar-item:focus-visible')
    expect(selectionToolbarStyles).toContain('.divider')
    expect(selectionToolbarStyles).toContain('@media (prefers-reduced-motion: reduce)')
    expect(selectionToolbarStyles).not.toContain('#')
  })

  it('scopes local playground overrides to the active editor root', () => {
    expect(markdownEditorSource).toContain('crepe crepe-playground')
    expect(playgroundStyles).toContain('.crepe-playground .milkdown')
    expect(playgroundStyles).not.toContain('.crepe .milkdown')
    expect(playgroundStyles).not.toMatch(/(^|\n)\.milkdown \*/)
  })

  it('maps Crepe colors to MarkLab tokens and keeps an editorial reading column', () => {
    expect(playgroundStyles).toContain('.crepe-playground > .milkdown > .ProseMirror')
    expect(playgroundStyles).toContain('--crepe-color-background: hsl(var(--background));')
    expect(playgroundStyles).toContain('--crepe-color-on-background: hsl(var(--foreground));')
    expect(playgroundStyles).toContain('--crepe-color-primary: hsl(var(--primary));')
    expect(playgroundStyles).toContain('--crepe-color-hover: color-mix(in srgb, hsl(var(--accent))')
    expect(playgroundStyles).toContain('overflow-y: scroll;')
    expect(playgroundStyles).toContain("--editor-prose-font: ui-serif, 'Noto Serif SC'")
    expect(playgroundStyles).toContain('width: min(100%, 760px);')
    expect(playgroundStyles).toContain('margin-inline: auto;')
    expect(playgroundStyles).toContain('line-height: 1.9;')
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
    expect(playgroundStyles).not.toContain('marklab-editor-drop-indicator')
    expect(playgroundStyles).not.toContain('ProseMirror-hideselection')
    expect(playgroundStyles).not.toContain('milkdown-block-handle')
    expect(playgroundStyles).not.toContain('data-editor-dragging')
  })

  it('keeps focus and typewriter behavior active in the runtime stylesheet', () => {
    expect(playgroundStyles).toContain('.crepe-playground.is-typewriter-editor')
    expect(playgroundStyles).toContain('.crepe-playground.is-focus-editor')
    expect(playgroundStyles).toContain('.marklab-md-block:not(:focus-within)')
    expect(playgroundStyles).toContain('opacity: 0.64;')
    expect(playgroundStyles).toContain('scroll-padding-block: 22vh 34vh;')
  })

  it('keeps the legacy custom editor styles available but inactive', () => {
    expect(legacyEditorStyles).toContain('marklab-md-block')
    expect(legacyControlStyles).toContain("@use './editor-controls/tokens'")
  })
})
