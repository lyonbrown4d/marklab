import { forwardRef } from 'react'
import MarkdownEditorSurface from '@/components/MarkdownEditorSurface'
import VirtualizedMarkdownEditor from '@/components/VirtualizedMarkdownEditor'
import { markdownEditorPerformancePolicy } from '@/components/markdownEditorPerformance'
import type {
  MarkdownEditorHandle,
  MarkdownEditorProps,
} from '@/components/milkdown/markdownEditorTypes'

const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>((props, ref) => {
  if (markdownEditorPerformancePolicy(props.value).virtualizeDocument) {
    return <VirtualizedMarkdownEditor {...props} ref={ref} />
  }
  return <MarkdownEditorSurface {...props} ref={ref} />
})

export default MarkdownEditor
