import { useState } from 'react'
import { FileX2 } from 'lucide-react'
import AppButton from '@/components/AppButton'
import AppEmptyState from '@/components/AppEmptyState'
import { useI18n } from '@/i18n/useI18n'

type NotFoundPageProps = {
  title?: string
  description?: string
  files?: { path: string }[]
  onOpenFile?: (path: string) => void
}

const NotFoundPage = ({ title, description, files = [], onOpenFile }: NotFoundPageProps) => {
  const [selected, setSelected] = useState('')
  const { t } = useI18n()

  return (
    <div className="editor-stage flex h-full items-center justify-center p-6">
      <AppEmptyState
        className="w-full max-w-lg bg-card text-card-foreground"
        icon={<FileX2 className="size-5 text-muted-foreground" />}
        title={title ?? t('notFound.title')}
        description={description ?? t('notFound.description')}
        action={
          <div className="flex w-full items-center gap-2">
            <select
              className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm"
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="">{t('notFound.selectPlaceholder')}</option>
              {files.map((file) => (
                <option key={file.path} value={file.path}>
                  {file.path}
                </option>
              ))}
            </select>
            <AppButton
              size="sm"
              variant="secondary"
              className="h-9 rounded-md"
              disabled={!selected || !onOpenFile}
              onClick={() => {
                if (selected && onOpenFile) {
                  onOpenFile(selected)
                }
              }}
            >
              {t('notFound.open')}
            </AppButton>
          </div>
        }
      />
    </div>
  )
}
export default NotFoundPage
