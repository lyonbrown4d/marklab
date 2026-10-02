import throttle from 'lodash-es/throttle'
import { markdownEditorPerformancePolicy } from '@/components/markdownEditorPerformance'
import type {
  MarkdownEditorProps,
  QueuedMarkdownUpdate,
  ThrottledMarkdownUpdate,
} from '@/components/milkdown/markdownEditorTypes'

type MutableValue<T> = { current: T }

type MarkdownUpdateThrottleOptions = {
  activePathRef: MutableValue<string | null>
  latestValuePathRef: MutableValue<string | null>
  latestValueRef: MutableValue<string>
  onChangeRef: MutableValue<MarkdownEditorProps['onChange']>
}

export const createMarkdownUpdateThrottle = ({
  activePathRef,
  latestValuePathRef,
  latestValueRef,
  onChangeRef,
}: MarkdownUpdateThrottleOptions) =>
  throttle(
    (update: QueuedMarkdownUpdate) => {
      const { documentIdentity, markdown, onChange: queuedOnChange } = update
      const isCurrentTarget =
        documentIdentity === activePathRef.current && queuedOnChange === onChangeRef.current
      if (
        isCurrentTarget &&
        documentIdentity === latestValuePathRef.current &&
        markdown === latestValueRef.current
      )
        return
      if (isCurrentTarget) {
        latestValuePathRef.current = documentIdentity
        latestValueRef.current = markdown
      }
      queuedOnChange(markdown)
    },
    markdownEditorPerformancePolicy(latestValueRef.current.length).updateThrottleMs,
    { leading: false, trailing: true },
  ) as ThrottledMarkdownUpdate
