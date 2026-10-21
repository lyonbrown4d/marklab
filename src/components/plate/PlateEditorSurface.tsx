import type { Value } from 'platejs'
import { Plate, PlateContent } from 'platejs/react'
import { forwardRef, memo, useCallback, useImperativeHandle, useRef } from 'react'
import { cn } from '@/lib/utils'
import { manualTextInputAttributes } from '@/components/editor/manualTextInputAttributes'
import {
  renderPlateEditorChunk,
  renderReadOnlyPlateEditorChunk,
} from '@/components/plate/plateEditorConfig'
import { PlateEditorInteractionOverlays } from '@/components/plate/PlateEditorInteractionOverlays'
import {
  PlateExternalValueSyncController,
  type PlateExternalValueSyncHandle,
} from '@/components/plate/PlateExternalValueSyncController'
import { PlateDndProvider } from '@/components/plate/PlateDndProvider'
import { PlateDndEdgeScroller } from '@/components/plate/PlateDndEdgeScroller'
import { usePlateTypewriterScroll } from '@/components/plate/usePlateTypewriterScroll'
import { usePlateSurfaceCompletions } from '@/components/plate/usePlateSurfaceCompletions'
import { usePlateAsyncInitialValue } from '@/components/plate/usePlateAsyncInitialValue'
import { usePlateMarkdownSnapshot } from '@/components/plate/usePlateMarkdownSnapshot'
import { type PlateSlashCommandLabels, usePlateSlashCommands } from '@/components/plate/slash'
import { usePlateEditorAssets } from '@/components/plate/usePlateEditorAssets'
import { usePlateEditorFocusLifecycle } from '@/components/plate/usePlateEditorFocusLifecycle'
import { usePlateEditorDomEvents } from '@/components/plate/usePlateEditorDomEvents'
import { useConfiguredPlateEditor } from '@/components/plate/useConfiguredPlateEditor'
import { usePlateEditorChangeHandlers } from '@/components/plate/usePlateEditorChangeHandlers'
import { usePlateSurfaceDecorations } from '@/components/plate/usePlateSurfaceDecorations'
import { usePlateSurfaceLinkInput } from '@/components/plate/usePlateSurfaceLinkInput'
import { useCachedEditorInteractionGate } from '@/components/useCachedEditorInteractionGate'
import {
  serializePlateMarkdown,
  shouldParsePlateMarkdownInWorker,
} from '@/services/plateMarkdownWorkerClient'
import type {
  PlateEditorSurfaceHandle,
  PlateEditorSurfaceProps,
} from '@/components/plate/plateEditorSurfaceTypes'
export type { PlateEditorSurfaceHandle } from '@/components/plate/plateEditorSurfaceTypes'
const PlateEditorSurfaceImpl = forwardRef<PlateEditorSurfaceHandle, PlateEditorSurfaceProps>(
  (
    {
      activePath,
      assetImportStrategy = 'copy-to-document-assets',
      autoFocus,
      className,
      completionEnabled = true,
      contentVisible = true,
      interactionActive = true,
      onCalendarFileCreate,
      onChange,
      onImageImport,
      onStatusChange,
      onWorkspaceLink,
      placeholder,
      readOnly = false,
      selectionToolbarLabels,
      shortcutOverrides,
      slashLabels,
      smoothScrolling = false,
      typewriterScroll = false,
      value,
      workspaceKey,
    },
    ref,
  ) => {
    const editableRef = useRef<HTMLDivElement | null>(null)
    const shellRef = useRef<HTMLDivElement | null>(null)
    const composingRef = useRef(false)
    const changeRevisionRef = useRef(0)
    const externalApplyRef = useRef(false)
    const latestExternalValueRef = useRef(value)
    const localEchoRef = useRef<string | null>(null)
    const externalSyncRef = useRef<PlateExternalValueSyncHandle | null>(null)
    const externalLoadingRef = useRef(false)
    const acceptsLocalChanges = useCachedEditorInteractionGate(interactionActive)
    const asyncInitialValue = shouldParsePlateMarkdownInWorker(value)
    const editor = useConfiguredPlateEditor({
      activePath,
      asyncInitialValue,
      onWorkspaceLink,
      value,
    })

    const ready = usePlateAsyncInitialValue({
      editor,
      enabled: asyncInitialValue,
      externalApplyRef,
      latestExternalValueRef,
      onStatusChange,
      value,
    })
    const contentReady = ready && contentVisible
    const headingTrackingEnabled = interactionActive && contentReady
    const getMarkdown = useCallback(
      () => Promise.resolve(serializePlateMarkdown(editor, editor.children as Value)),
      [editor],
    )
    const commitSnapshot = useCallback(
      (markdown: string) => {
        if (markdown === latestExternalValueRef.current || markdown === localEchoRef.current) return
        localEchoRef.current = markdown
        onChange(markdown)
      },
      [onChange],
    )
    const {
      cancel: cancelSnapshot,
      flush: flushSnapshot,
      markDirty: markSnapshotDirty,
      queue: enqueueSnapshot,
    } = usePlateMarkdownSnapshot({
      editor,
      onError: (error) => onStatusChange?.({ message: error.message, phase: 'error' }),
      onSnapshot: commitSnapshot,
    })
    const isEditorReady = useCallback(
      () => interactionActive && contentReady && !externalLoadingRef.current,
      [contentReady, interactionActive],
    )
    const { assetDrop, pickAndImportImage } = usePlateEditorAssets({
      activePath,
      canEdit: isEditorReady,
      editor,
      getMarkdown,
      readOnly: readOnly || !contentReady,
      shellRef,
      strategy: assetImportStrategy,
    })
    const slash = usePlateSlashCommands({
      canEdit: isEditorReady,
      documentIdentity: activePath,
      editor,
      interactionActive: interactionActive && contentReady,
      labels: slashLabels ?? ({} as PlateSlashCommandLabels),
      onCalendarFileCreate,
      onImageImport: onImageImport ?? pickAndImportImage,
    })
    const { onKeyDown: onSlashKeyDown, syncFromEditor: syncSlashFromEditor } = slash
    const openLinkInput = usePlateSurfaceLinkInput(
      editor,
      slash.urlInput,
      () => !readOnly && isEditorReady(),
    )
    const scheduleTypewriterScroll = usePlateTypewriterScroll({
      editableRef,
      enabled: typewriterScroll && !readOnly,
      smooth: smoothScrolling,
    })
    const completion = usePlateSurfaceCompletions({
      activePath,
      editor,
      enabled: interactionActive && contentReady && completionEnabled,
      getMarkdown,
      readOnly,
      value,
    })
    const { decorate, scheduleDiagnostics } = usePlateSurfaceDecorations({
      activePath,
      completion,
      editor,
      enabled: interactionActive && contentReady,
      getMarkdown,
      readOnly,
      value,
      workspaceKey,
    })
    const syncActiveFocusBlock = usePlateEditorFocusLifecycle({
      autoFocus,
      className,
      contentReady,
      editableRef,
      editor,
      interactionActive,
      readOnly,
    })

    const queueSnapshot = useCallback(() => {
      if (composingRef.current) return
      syncSlashFromEditor()
      scheduleTypewriterScroll()
      scheduleDiagnostics()
      enqueueSnapshot()
    }, [enqueueSnapshot, scheduleDiagnostics, scheduleTypewriterScroll, syncSlashFromEditor])

    usePlateEditorDomEvents({
      applyPendingExternal: () => externalSyncRef.current?.applyPending() ?? false,
      completion,
      composingRef,
      editableRef,
      editor,
      flushSnapshot,
      onSlashKeyDown,
      openLinkInput,
      pickAndImportImage,
      queueSnapshot,
      readOnly,
      isReady: isEditorReady,
      shortcutOverrides,
    })

    useImperativeHandle(ref, () => ({
      focus: () => {
        if (isEditorReady()) editableRef.current?.focus()
      },
      getEditor: () => editor,
      getMarkdown,
      openLinkInput,
    }))

    const { handleSelectionChange, handleValueChange } = usePlateEditorChangeHandlers({
      acceptsLocalChanges,
      activePath,
      changeRevisionRef,
      editableRef,
      editor,
      externalApplyRef,
      headingTrackingEnabled,
      markSnapshotDirty,
      onEditorChange: completion.onEditorChange,
      onSelectionChange: completion.onSelectionChange,
      queueSnapshot,
      syncActiveFocusBlock,
      syncSlashFromEditor,
    })

    return (
      <div
        {...assetDrop.dropzoneRootProps}
        data-plate-editor-shell="true"
        data-testid="plate-editor-shell"
        ref={assetDrop.setShellElement}
      >
        <PlateDndProvider>
          <Plate
            decorate={decorate}
            editor={editor}
            onSelectionChange={handleSelectionChange}
            onValueChange={handleValueChange}
            readOnly={readOnly}
            renderLeaf={completion.renderLeaf}
          >
            <PlateContent
              {...manualTextInputAttributes}
              aria-label={placeholder}
              aria-busy={!contentReady}
              aria-hidden={!contentReady ? 'true' : undefined}
              className={cn(
                'markdown-editor__content min-h-full w-full outline-none',
                readOnly && 'cursor-default',
                className,
              )}
              data-editor-engine="plate"
              data-readonly={readOnly ? 'true' : undefined}
              data-state={contentReady ? 'ready' : 'loading'}
              data-testid="markdown-editor"
              inert={!contentReady ? true : undefined}
              placeholder={placeholder}
              readOnly={readOnly}
              ref={editableRef}
              renderChunk={readOnly ? renderReadOnlyPlateEditorChunk : renderPlateEditorChunk}
              spellCheck
              tabIndex={readOnly ? 0 : undefined}
            />
            <PlateDndEdgeScroller containerRef={editableRef} />
            <PlateEditorInteractionOverlays
              activePath={activePath}
              canEdit={isEditorReady}
              contentReady={contentReady}
              editableRef={editableRef}
              editor={editor}
              interactionActive={interactionActive}
              labels={slashLabels}
              onLink={openLinkInput}
              readOnly={readOnly}
              selectionLabels={selectionToolbarLabels}
              slash={slash}
            />
          </Plate>
          <PlateExternalValueSyncController
            key={activePath}
            cancelSnapshot={cancelSnapshot}
            changeRevisionRef={changeRevisionRef}
            composingRef={composingRef}
            contentReady={contentReady}
            controllerRef={externalSyncRef}
            editableRef={editableRef}
            editor={editor}
            externalApplyRef={externalApplyRef}
            latestExternalValueRef={latestExternalValueRef}
            loadingRef={externalLoadingRef}
            localEchoRef={localEchoRef}
            onStatusChange={onStatusChange}
            readOnly={readOnly}
            ready={ready}
            value={value}
          />
        </PlateDndProvider>
      </div>
    )
  },
)
PlateEditorSurfaceImpl.displayName = 'PlateEditorSurface'
export const PlateEditorSurface = memo(PlateEditorSurfaceImpl)
