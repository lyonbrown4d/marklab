import type { Node as ProseMirrorNode } from '@milkdown/kit/prose/model'
import type {
  MarkdownEditorProps,
  ThrottledMarkdownUpdate,
} from '@/components/milkdown/markdownEditorTypes'
import { createMarkdownSnapshotScheduler } from '@/components/milkdown/markdownSnapshotScheduler'
import { markdownDocumentChangePlugin } from '@/components/milkdown/markdownDocumentChangePlugin'

type MutableValue<T> = { current: T }

type MarkdownSnapshotBridgeOptions = {
  activePathRef: MutableValue<string | null>
  onChangeRef: MutableValue<MarkdownEditorProps['onChange']>
  updateMarkdown: ThrottledMarkdownUpdate
}

export type MarkdownSnapshotScheduler = ReturnType<
  typeof createMarkdownSnapshotScheduler<ProseMirrorNode>
>

export const createMarkdownSnapshotBridge = (
  serialize: (document: ProseMirrorNode) => string,
  { activePathRef, onChangeRef, updateMarkdown }: MarkdownSnapshotBridgeOptions,
): MarkdownSnapshotScheduler => {
  const scheduler = createMarkdownSnapshotScheduler({
    commit: (markdown) => {
      updateMarkdown({
        documentIdentity: activePathRef.current,
        markdown,
        onChange: onChangeRef.current,
      })
    },
    serialize,
  })

  return scheduler
}

export const createMarkdownSnapshotPlugin = (
  canSnapshot: () => boolean,
  getScheduler: () => MarkdownSnapshotScheduler | null,
) =>
  markdownDocumentChangePlugin((document) => {
    if (canSnapshot()) getScheduler()?.update(document)
  })

export const disposeMarkdownSnapshotBridge = (
  scheduler: MarkdownSnapshotScheduler | null,
  schedulerRef: MutableValue<MarkdownSnapshotScheduler | null>,
  updateMarkdown: ThrottledMarkdownUpdate,
  updateMarkdownRef: MutableValue<ThrottledMarkdownUpdate | null>,
) => {
  scheduler?.flush()
  updateMarkdown.flush()
  scheduler?.cancel()
  updateMarkdown.cancel()
  if (schedulerRef.current === scheduler) schedulerRef.current = null
  if (updateMarkdownRef.current === updateMarkdown) updateMarkdownRef.current = null
}
