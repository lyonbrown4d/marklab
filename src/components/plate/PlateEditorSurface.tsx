import type { Value } from 'platejs'
import { Plate, PlateContent, type PlateEditor, usePlateEditor } from 'platejs/react'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import { cn } from '@/lib/utils'
import {
  createPlateEditorPlugins,
  plateChunkingOptions,
} from '@/components/plate/plateEditorConfig'
import { handlePlateEditorShortcut } from '@/components/plate/plateEditorShortcuts'
import { syncPlateFocusActiveBlock } from '@/components/plate/plateFocusMode'
import { setPlateMarkdownInputRulesComposing } from '@/components/plate/plateMarkdownInputRules'
import { PlateEditorOverlays } from '@/components/plate/PlateEditorOverlays'
import { PlateDndProvider } from '@/components/plate/PlateDndProvider'
import { capturePlateSelectionLinkInsertion } from '@/components/plate/selection/plateSelectionLinkInsertion'
import { usePlateTypewriterScroll } from '@/components/plate/usePlateTypewriterScroll'
import { usePlateInlineCompletion } from '@/components/plate/usePlateInlineCompletion'
import {
  usePlateAsyncInitialValue,
  usePlateExternalValueSync,
} from '@/components/plate/usePlateAsyncInitialValue'
import { usePlateMarkdownSnapshot } from '@/components/plate/usePlateMarkdownSnapshot'
import {
  capturePlateSlashUrlInsertion,
  type PlateSlashCommandLabels,
  usePlateSlashCommands,
} from '@/components/plate/slash'
import { usePlateEditorAssets } from '@/components/plate/usePlateEditorAssets'
import { usePlateAnimatedCursor } from '@/components/plate/usePlateAnimatedCursor'
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

export const PlateEditorSurface = forwardRef<PlateEditorSurfaceHandle, PlateEditorSurfaceProps>(
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
      queue: enqueueSnapshot,
    } = usePlateMarkdownSnapshot({
      editor,
      onError: (error) => onStatusChange?.({ message: error.message, phase: 'error' }),
      onSnapshot: commitSnapshot,
    })
    const applyPendingExternal = usePlateExternalValueSync({
      cancelSnapshot,
      changeRevisionRef,
      composingRef,
      editableRef,
      editor,
      externalApplyRef,
      latestExternalValueRef,
      localEchoRef,
      onStatusChange,
      ready,
      value,
    })
    const { assetDrop, pickAndImportImage } = usePlateEditorAssets({
      activePath,
      editor,
      getMarkdown,
      readOnly,
      shellRef,
      strategy: assetImportStrategy,
    })
    const slash = usePlateSlashCommands({
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

    useEffect(() => {
      const editable = editableRef.current
      if (!editable) return
      const handleKeyDown = (event: KeyboardEvent) => {
        if (!ready || readOnly) return
        if (!readOnly && completion.onKeyDown(event)) return
        if (!readOnly && !onSlashKeyDown(event)) {
          handlePlateEditorShortcut(editor, event, shortcutOverrides, {
            onImageImport: () => void pickAndImportImage(),
            onLinkInsert: () => openLinkDialog(),
          })
        }
      }
      const handleCompositionStart = () => {
        composingRef.current = true
        setPlateMarkdownInputRulesComposing(editor, true)
        completion.onCompositionStart()
      }
      const handleCompositionEnd = () => {
        composingRef.current = false
        completion.onCompositionEnd()
        if (!applyPendingExternal()) queueSnapshot()
        queueMicrotask(() => setPlateMarkdownInputRulesComposing(editor, false))
      }
      const handleBlur = () => {
        if (!applyPendingExternal()) flushSnapshot()
      }
      editable.addEventListener('keydown', handleKeyDown, { capture: true })
      editable.addEventListener('compositionstart', handleCompositionStart, { capture: true })
      editable.addEventListener('compositionend', handleCompositionEnd, { capture: true })
      editable.addEventListener('blur', handleBlur)
      return () => {
        editable.removeEventListener('keydown', handleKeyDown, { capture: true })
        editable.removeEventListener('compositionstart', handleCompositionStart, { capture: true })
        editable.removeEventListener('compositionend', handleCompositionEnd, { capture: true })
        editable.removeEventListener('blur', handleBlur)
      }
    }, [
      applyPendingExternal,
      completion,
      editor,
      flushSnapshot,
      queueSnapshot,
      readOnly,
      ready,
      shortcutOverrides,
      onSlashKeyDown,
      openLinkDialog,
      pickAndImportImage,
    ])

    useImperativeHandle(ref, () => ({
      focus: () => editableRef.current?.focus(),
      getEditor: () => editor,
      getMarkdown,
      openLinkDialog,
    }))

    const handleValueChange = useCallback(() => {
      if (externalApplyRef.current) return
      changeRevisionRef.current += 1
      completion.onEditorChange()
      queueSnapshot()
    }, [completion, queueSnapshot])

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
            readOnly={readOnly || !ready}
            renderLeaf={completion.renderLeaf}
          >
            <PlateContent
              aria-label={placeholder}
              className={cn(
                'markdown-editor__content min-h-full w-full outline-none',
                readOnly && 'cursor-default',
                className,
              )}
              data-editor-engine="plate"
              data-readonly={readOnly ? 'true' : undefined}
              data-state={ready ? 'ready' : 'loading'}
              data-testid="markdown-editor"
              placeholder={placeholder}
              readOnly={readOnly || !ready}
              ref={editableRef}
              spellCheck
              tabIndex={readOnly ? 0 : undefined}
            />
            {slashLabels && (
              <PlateEditorOverlays
                activePath={activePath}
                editableRef={editableRef}
                labels={slashLabels}
                onLink={openLinkDialog}
                slash={slash}
              />
            )}
          </Plate>
        </PlateDndProvider>
      </div>
    )
  },
)

PlateEditorSurface.displayName = 'PlateEditorSurface'
