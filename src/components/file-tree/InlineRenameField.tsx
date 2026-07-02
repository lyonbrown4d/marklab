import { useEffect, useId, useRef } from 'react'
import type { NodeApi } from 'react-arborist'
import type { FileTreeNode } from '@/logic/fileTree'

type InlineRenameFieldProps = {
  node: NodeApi<FileTreeNode>
  label?: string
}

export const InlineRenameField = ({ node, label }: InlineRenameFieldProps) => {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const descriptionId = useId()
  const isFinishedRef = useRef(false)
  const inputLabel = label ?? `Rename ${node.data.name}`

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const reset = () => {
    if (isFinishedRef.current) {
      return
    }

    isFinishedRef.current = true
    node.reset()
  }

  const submit = () => {
    if (isFinishedRef.current) {
      return
    }

    const nextName = inputRef.current?.value.trim() ?? ''
    if (!nextName || nextName === node.data.name || nextName.includes('/')) {
      reset()
      return
    }

    isFinishedRef.current = true
    void node.submit(nextName)
  }

  return (
    <span className="ml-1 flex min-w-0 flex-1 items-center">
      <input
        ref={inputRef}
        aria-describedby={descriptionId}
        aria-label={inputLabel}
        autoComplete="off"
        data-file-tree-inline-rename="true"
        defaultValue={node.data.name}
        spellCheck={false}
        title={inputLabel}
        className="h-5 min-w-0 flex-1 rounded-md border border-ring bg-background px-1.5 text-xs font-medium text-foreground shadow-sm outline-none transition-[border-color,box-shadow] focus-visible:ring-2 focus-visible:ring-ring/35"
        onBlur={submit}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation()

          if (event.key === 'Escape') {
            event.preventDefault()
            reset()
            return
          }

          if (event.key === 'Enter') {
            event.preventDefault()
            submit()
          }
        }}
      />
      <span id={descriptionId} className="sr-only">
        Press Enter to save, Escape to cancel. Names cannot include /.
      </span>
    </span>
  )
}
