import { Spinner } from '@/components/ui/spinner'

type PreviewLoadingFallbackProps = {
  label: string
}

export const PreviewLoadingFallback = ({ label }: PreviewLoadingFallbackProps) => (
  <div
    aria-busy="true"
    aria-label={label}
    className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"
    role="status"
  >
    <Spinner aria-hidden="true" role="presentation" />
    <span>{label}</span>
  </div>
)
