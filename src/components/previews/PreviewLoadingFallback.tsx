import { Loader2 } from 'lucide-react'

type PreviewLoadingFallbackProps = {
  label: string
}

export const PreviewLoadingFallback = ({ label }: PreviewLoadingFallbackProps) => (
  <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
    <Loader2 className="size-4 animate-spin" />
    {label}
  </div>
)
