import { AlertCircle, Circle, FileText } from 'lucide-react'

type TitlebarActiveTabBadgeProps = {
  title: string
  isDirty: boolean
  hasError: boolean
  unsavedLabel: string
  errorLabel: string
}

export const TitlebarActiveTabBadge = ({
  title,
  isDirty,
  hasError,
  unsavedLabel,
  errorLabel,
}: TitlebarActiveTabBadgeProps) => {
  const stateLabel = hasError ? errorLabel : isDirty ? unsavedLabel : null
  const badgeLabel = stateLabel ? `${title} - ${stateLabel}` : title

  return (
    <span
      aria-label={badgeLabel}
      className="flex min-w-0 max-w-[220px] shrink items-center gap-1.5 text-xs text-muted-foreground"
      title={badgeLabel}
    >
      <FileText aria-hidden="true" data-icon="inline-start" className="size-3.5 shrink-0" />
      <span className="truncate text-foreground/85">{title}</span>
      {stateLabel ? (
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
          {hasError ? (
            <AlertCircle className="size-3 text-destructive" aria-hidden="true" />
          ) : (
            <Circle className="size-1.5 fill-current text-primary" aria-hidden="true" />
          )}
          <span className="hidden xl:inline">{stateLabel}</span>
        </span>
      ) : null}
    </span>
  )
}
