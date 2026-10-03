import type { Value } from 'platejs'
import { Plate, PlateContent, type PlateEditor, usePlateEditor } from 'platejs/react'
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import { cn } from '@/lib/utils'
import {
  createPlateEditorPlugins,
  plateChunkingOptions,
  renderPlateEditorChunk,
} from '@/components/plate/plateEditorConfig'
import { syncPlateFocusActiveBlock } from '@/components/plate/plateFocusMode'
import { PlateEditorOverlays } from '@/components/plate/PlateEditorOverlays'
import {
  PlateExternalValueSyncController,
  type PlateExternalValueSyncHandle,
} from '@/components/plate/PlateExternalValueSyncController'
import { PlateDndProvider } from '@/components/plate/PlateDndProvider'
import { capturePlateSelectionLinkInsertion } from '@/components/plate/selection/plateSelectionLinkInsertion'
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
import { usePlateAnimatedCursor } from '@/components/plate/usePlateAnimatedCursor'
import { usePlateEditorDomEvents } from '@/components/plate/usePlateEditorDomEvents'
import {
  loadPlateMarkdown,
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
      onCalendarFileCreate,
      onChange,
      onImageImport,
      onStatusChange,
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
    const activeFocusBlockRef = useRef<HTMLElement | null>(null)
    const composingRef = useRef(false)
    const changeRevisionRef = useRef(0)
    const externalApplyRef = useRef(false)
    const latestExternalValueRef = useRef(value)
    const localEchoRef = useRef<string | null>(null)
    const externalSyncRef = useRef<PlateExternalValueSyncHandle | null>(null)
    const externalLoadingRef = useRef(false)
    const asyncInitialValue = shouldParsePlateMarkdownInWorker(value)
    const editor = usePlateEditor(
      {
        chunking: plateChunkingOptions,
        plugins: createPlateEditorPlugins({ getDocumentPath: () => activePath }),
        value: asyncInitialValue
          ? [{ type: 'p', children: [{ text: '' }] }]
          : (instance) => loadPlateMarkdown(instance, value),
      },
      [activePath],
    )

    const ready = usePlateAsyncInitialValue({
      editor,
      enabled: asyncInitialValue,
      externalApplyRef,
      latestExternalValueRef,
      onStatusChange,
      value,
    })
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
    const isEditorReady = useCallback(() => ready && !externalLoadingRef.current, [ready])
    const { assetDrop, pickAndImportImage } = usePlateEditorAssets({
      activePath,
      canEdit: isEditorReady,
      editor,
      getMarkdown,
      readOnly: readOnly || !ready,
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
      readOnly: readOnly || !ready,
      value,
    })
    usePlateAnimatedCursor({ editableRef, enabled: !readOnly && ready })

    const queueSnapshot = useCallback(() => {
      if (composingRef.current) return
      syncSlashFromEditor()
      scheduleTypewriterScroll()
      enqueueSnapshot()
    }, [enqueueSnapshot, scheduleTypewriterScroll, syncSlashFromEditor])

    useEffect(() => {
      if (autoFocus && !readOnly && ready) editableRef.current?.focus()
    }, [autoFocus, editor, readOnly, ready])

    useEffect(() => {
      const editable = editableRef.current
      activeFocusBlockRef.current = syncPlateFocusActiveBlock(
        editor,
        editable,
        activeFocusBlockRef.current,
      )
      return () => {
        activeFocusBlockRef.current?.removeAttribute('data-focus-active')
        editable?.removeAttribute('data-focus-active')
        activeFocusBlockRef.current = null
      }
    }, [className, editor, ready])

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
      activeFocusBlockRef.current = syncPlateFocusActiveBlock(
        editor,
        editableRef.current,
        activeFocusBlockRef.current,
      )
    }, [completion, editor, syncSlashFromEditor])

    return (
      <div {...assetDrop.dropzoneRootProps} ref={assetDrop.setShellElement}>
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
              aria-busy={!ready}
              className={cn(
                'markdown-editor__content min-h-full w-full outline-none',
                readOnly && 'cursor-default',
                className,
              )}
              data-editor-engine="plate"
              data-readonly={readOnly ? 'true' : undefined}
              data-state={ready ? 'ready' : 'loading'}
              data-testid="markdown-editor"
              inert={!ready ? true : undefined}
              placeholder={placeholder}
              readOnly={readOnly}
              ref={editableRef}
              renderChunk={renderPlateEditorChunk}
              spellCheck
              tabIndex={readOnly ? 0 : undefined}
            />
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
