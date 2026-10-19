import { createContext, lazy, Suspense, useContext, useState, type ReactNode } from 'react'
import {
  createHtmlPortalNode,
  InPortal,
  OutPortal,
  type HtmlPortalNode,
} from 'react-reverse-portal'
import { useMarkdownEditorSlashLabels } from '@/components/editor/useMarkdownEditorSlashLabels'
import { useI18n } from '@/i18n/useI18n'
import { isImeKeyboardEvent } from '@/logic/ime'
import type { WorkspaceMapEditorLoadState } from '@/logic/graph'
import EditorPaneFallback from '@/pages/EditorPaneFallback'

const MarkdownEditor = lazy(() => import('@/components/MarkdownEditor'))
const EditorPortalContext = createContext<HtmlPortalNode | null>(null)

type EditorSurfaceProps = {
  activePath: string | null
  interactionActive?: boolean
  onChange: (value: string) => void
  onCloseEditor?: () => void
  readOnly: boolean
  value: string
  workspaceKey?: string
}

const EmbeddedEditorSurface = ({ onCloseEditor, ...props }: EditorSurfaceProps) => {
  const { t } = useI18n()
  const slashLabels = useMarkdownEditorSlashLabels()
  return (
    <Suspense fallback={<EditorPaneFallback label={t('workspaceMap.loadingDocument')} />}>
      <div
        className="absolute inset-0 overflow-hidden [contain:strict] [&>div]:h-full [&>div]:min-h-0 [&>div]:overflow-hidden [&>div>div:first-child]:h-full [&>div>div:first-child]:min-h-0 [&>div>div:first-child]:overflow-hidden"
        data-testid="workspace-map-editor-viewport"
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (
            (event.ctrlKey || event.metaKey) &&
            event.shiftKey &&
            !event.altKey &&
            event.key.toLowerCase() === 'f'
          )
            return
          event.stopPropagation()
          if (event.defaultPrevented || isImeKeyboardEvent(event.nativeEvent)) return
          if (event.key === 'Escape' && onCloseEditor) {
            event.preventDefault()
            onCloseEditor()
          }
        }}
        onKeyUp={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onWheelCapture={(event) => {
          if (!event.ctrlKey && !event.metaKey) event.stopPropagation()
        }}
      >
        <MarkdownEditor
          {...props}
          autoFocus
          placeholder={t('editor.placeholder')}
          slashLabels={slashLabels}
          variant="embedded"
        />
      </div>
    </Suspense>
  )
}

type ProviderProps = Omit<EditorSurfaceProps, 'value' | 'interactionActive'> & {
  children: ReactNode
  editorLoadState: WorkspaceMapEditorLoadState
  visible: boolean
  workspaceKey: string
}

// Only the editor owner changes with the path; the Canvas children keep their lifecycle.
export const WorkspaceMapEditorPortalProvider = ({
  children,
  editorLoadState,
  visible,
  ...props
}: ProviderProps) => {
  const identity = `${props.workspaceKey}\0${props.activePath ?? ''}`
  const [state, setState] = useState(() => ({
    identity,
    node: createHtmlPortalNode({
      attributes: { class: 'relative h-full min-h-0 w-full overflow-hidden' },
    }),
    lastReadyValue: editorLoadState.status === 'ready' ? editorLoadState.content : null,
  }))
  if (state.identity !== identity) {
    setState({
      identity,
      node: createHtmlPortalNode({
        attributes: { class: 'relative h-full min-h-0 w-full overflow-hidden' },
      }),
      lastReadyValue: editorLoadState.status === 'ready' ? editorLoadState.content : null,
    })
  } else if (
    editorLoadState.status === 'ready' &&
    state.lastReadyValue !== editorLoadState.content
  ) {
    setState({ ...state, lastReadyValue: editorLoadState.content })
  }
  const ready = editorLoadState.status === 'ready'
  return (
    <EditorPortalContext.Provider value={state.node}>
      {state.lastReadyValue !== null && props.activePath ? (
        <InPortal key={identity} node={state.node}>
          <EmbeddedEditorSurface
            {...props}
            interactionActive={visible && ready}
            readOnly={props.readOnly || !visible || !ready}
            value={state.lastReadyValue}
          />
        </InPortal>
      ) : null}
      {children}
    </EditorPortalContext.Provider>
  )
}

export const WorkspaceMapEditorPortal = (props: EditorSurfaceProps) => {
  const node = useContext(EditorPortalContext)
  return node ? <OutPortal node={node} /> : <EmbeddedEditorSurface {...props} />
}
