import { DocumentLoadingState } from '@/components/loading/DocumentLoadingState'

type PreviewLoadingFallbackProps = {
  label: string
}

export const PreviewLoadingFallback = ({ label }: PreviewLoadingFallbackProps) => (
  <DocumentLoadingState className="h-full" label={label} />
)
