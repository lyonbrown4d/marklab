import type { Value } from 'platejs'
import { Plate, PlateContent, type PlateEditor } from 'platejs/react'
import { forwardRef, memo, useCallback, useImperativeHandle, useRef } from 'react'
import { cn } from '@/lib/utils'
import {
  renderPlateEditorChunk,
  renderReadOnlyPlateEditorChunk,
} from '@/components/plate/plateEditorConfig'
import { PlateEditorOverlays } from '@/components/plate/PlateEditorOverlays'
import {
  PlateExternalValueSyncController,
  type PlateExternalValueSyncHandle,
} from '@/components/plate/PlateExternalValueSyncController'
import { PlateDndProvider } from '@/components/plate/PlateDndProvider'
import { PlateDndEdgeScroller } from '@/components/plate/PlateDndEdgeScroller'
import { capturePlateSelectionLinkInsertion } from '@/components/plate/selection/plateSelectionLinkInsertion'
import { PlateBlockSelectionCount } from '@/components/plate/selection/PlateBlockSelectionCount'
import { usePlateTypewriterScroll } from '@/components/plate/usePlateTypewriterScroll'
import { usePlateInlineCompletion } from '@/components/plate/usePlateInlineCompletion'
import { usePlateAsyncInitialValue } from '@/components/plate/usePlateAsyncInitialValue'
import { usePlateMarkdownSnapshot } from '@/components/plate/usePlateMarkdownSnapshot'
import {
  capturePlateSlashUrlInsertion,
  type PlateSlashCommandLabels,
  usePlateSlashCommands,
} from '@/components/plate/slash'
import { usePlateEditorAssets } from '@/components/plate/usePlateEditorAssets'
import { usePlateEditorFocusLifecycle } from '@/components/plate/usePlateEditorFocusLifecycle'
import { usePlateEditorDomEvents } from '@/components/plate/usePlateEditorDomEvents'
import { useConfiguredPlateEditor } from '@/components/plate/useConfiguredPlateEditor'
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
      contentVisible = true,
      onCalendarFileCreate,
      onChange,
      onImageImport,
      onStatusChange,
      onWorkspaceLink,
      placeholder,
      readOnly = false,
      shortcutOverrides,
      slashLabels,
      smoothScrolling = false,
      typewriterScroll = false,
      value,
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
      () => contentReady && !externalLoadingRef.current,
      [contentReady],
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
      labels: slashLabels ?? ({} as PlateSlashCommandLabels),
      onCalendarFileCreate,
      onImageImport: onImageImport ?? pickAndImportImage,
    })
    const { onKeyDown: onSlashKeyDown, syncFromEditor: syncSlashFromEditor } = slash
    const openLinkDialog = useCallback(
      (targetEditor: PlateEditor = editor) => {
        if (!targetEditor.selection) return false
        const request =
          capturePlateSelectionLinkInsertion(targetEditor) ??
          capturePlateSlashUrlInsertion(targetEditor, 'link', {
            query: '',
            range: targetEditor.selection,
            slashText: '',
          })
        slash.urlDialog.open(request)
        return true
      },
      [editor, slash.urlDialog],
    )
    const scheduleTypewriterScroll = usePlateTypewriterScroll({
      editableRef,
      enabled: typewriterScroll && !readOnly,
      smooth: smoothScrolling,
    })
    const completion = usePlateInlineCompletion({
      activePath,
      editor,
      readOnly: readOnly || !contentReady,
      value,
    })
    const syncActiveFocusBlock = usePlateEditorFocusLifecycle({
      autoFocus,
      className,
      contentReady,
      editableRef,
      editor,
      readOnly,
    })

    const queueSnapshot = useCallback(() => {
      if (composingRef.current) return
      syncSlashFromEditor()
      scheduleTypewriterScroll()
      enqueueSnapshot()
    }, [enqueueSnapshot, scheduleTypewriterScroll, syncSlashFromEditor])

    usePlateEditorDomEvents({
      applyPendingExternal: () => externalSyncRef.current?.applyPending() ?? false,
      completion,
      composingRef,
      editableRef,
      editor,
      flushSnapshot,
      onSlashKeyDown,
      openLinkDialog,
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
      openLinkDialog,
    }))

    const handleValueChange = useCallback(() => {
      if (externalApplyRef.current) return
      markSnapshotDirty()
      changeRevisionRef.current += 1
      completion.onEditorChange()
      queueSnapshot()
    }, [completion, markSnapshotDirty, queueSnapshot])
    const handleSelectionChange = useCallback(() => {
      completion.onSelectionChange()
      syncSlashFromEditor()
      syncActiveFocusBlock()
    }, [completion, syncActiveFocusBlock, syncSlashFromEditor])

    return (
      <div
        {...assetDrop.dropzoneRootProps}
        data-plate-editor-shell="true"
        data-testid="plate-editor-shell"
        ref={assetDrop.setShellElement}
      >
        <PlateDndProvider>
          <Plate
            decorate={completion.decorate}
            editor={editor}
            onSelectionChange={handleSelectionChange}
            onValueChange={handleValueChange}
            readOnly={readOnly}
            renderLeaf={completion.renderLeaf}
          >
            <PlateContent
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
            <PlateBlockSelectionCount />
            {slashLabels && (
              <PlateEditorOverlays
                activePath={activePath}
                canEdit={isEditorReady}
                editableRef={editableRef}
                labels={slashLabels}
                onLink={openLinkDialog}
                slash={slash}
              />
            )}
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
