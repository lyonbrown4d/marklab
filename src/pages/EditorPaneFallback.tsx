import { DocumentLoadingState } from '@/components/loading/DocumentLoadingState'
import { useI18n } from '@/i18n/useI18n'

type EditorPaneFallbackProps = {
  label?: string
  path?: string | null
}

const EditorPaneFallback = ({ label, path }: EditorPaneFallbackProps) => {
  const { t } = useI18n()
  const loadingLabel = label ?? t('editor.loading')

  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-4 bg-background p-6 text-center"
      data-editor-loading="true"
    >
      <DocumentLoadingState description={path} label={loadingLabel} />
    </div>
  )
}

export default EditorPaneFallback
