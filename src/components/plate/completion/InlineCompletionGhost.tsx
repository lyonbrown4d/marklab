type InlineCompletionGhostProps = {
  accept?: () => void
  acceptLabel: string
  acceptWordLabel?: string
  dismissLabel: string
  partialAcceptShortcut?: string
  source: 'ai' | 'document'
  sourceLabel: string
  text: string
}

export const InlineCompletionGhost = ({
  accept,
  acceptLabel,
  acceptWordLabel,
  dismissLabel,
  partialAcceptShortcut,
  source,
  sourceLabel,
  text,
}: InlineCompletionGhostProps) => {
  const isAi = source === 'ai'

  return (
    <span
      contentEditable={false}
      data-completion-kind={source}
      onMouseDown={
        accept
          ? (event) => {
              if (event.button !== 0) return
              event.preventDefault()
              accept()
            }
          : undefined
      }
    >
      <span aria-hidden="true">
        <span
          className={
            isAi
              ? 'marklab-ai-ghost-text'
              : 'pointer-events-none select-none whitespace-pre-wrap text-muted-foreground/55'
          }
          data-completion-ghost=""
        >
          {text}
        </span>
        <span
          className={
            isAi
              ? 'marklab-ai-ghost-meta'
              : 'pointer-events-none ml-2 inline-flex select-none items-center gap-2 whitespace-nowrap text-[0.6875rem] leading-none text-muted-foreground'
          }
          data-completion-hint=""
        >
          <span data-completion-source="">{sourceLabel}</span>
          <span>Tab {acceptLabel}</span>
          {partialAcceptShortcut && acceptWordLabel ? (
            <span>
              {partialAcceptShortcut} {acceptWordLabel}
            </span>
          ) : null}
          <span>Esc {dismissLabel}</span>
        </span>
      </span>
      <span aria-atomic="true" aria-live="polite" className="sr-only" role="status">
        {sourceLabel}: {text.replace(/\s+/gu, ' ').trim()}
      </span>
    </span>
  )
}
