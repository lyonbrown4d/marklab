import { FileX2 } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import type { GitPreviewUnavailableReason } from '@/types/gitPreview'

type Props = { reason: GitPreviewUnavailableReason; conflict?: boolean }

export const GitDiffUnavailable = ({ reason, conflict = false }: Props) => {
  const { t } = useI18n()
  return (
    <div
      role="status"
      aria-label={t('scm.diffUnavailable.title')}
      className="flex h-full min-h-0 items-center justify-center overflow-auto p-6"
    >
      <div className="max-w-sm space-y-2 text-center text-sm text-muted-foreground">
        <FileX2 aria-hidden="true" className="mx-auto size-6" />
        <h3 className="font-medium text-foreground">{t('scm.diffUnavailable.title')}</h3>
        <p>{t(`scm.diffUnavailable.${reason}`)}</p>
        {conflict && <p>{t('scm.diffUnavailable.conflict')}</p>}
      </div>
    </div>
  )
}
