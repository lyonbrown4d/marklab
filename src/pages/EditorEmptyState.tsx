import { FileText, Search } from 'lucide-react'
import AppLogo from '@/components/AppLogo'
import AppButton from '@/components/AppButton'
import AppEmptyState from '@/components/AppEmptyState'
import { Badge } from '@/components/ui/badge'
import { useI18n } from '@/i18n/useI18n'
import type { FileEntry } from '@/store/appTypes'
import { requestFileSearchFocus } from '@/utils/appEvents'

type EditorEmptyStateProps = {
  files: FileEntry[]
  onOpenFile: (path: string) => void
}

const EditorEmptyState = ({ files, onOpenFile }: EditorEmptyStateProps) => {
  const { t } = useI18n()
  const visibleFiles = files.slice(0, 6)
  const hasVisibleFiles = visibleFiles.length > 0

  return (
    <div className="editor-stage flex h-full items-center justify-center p-6">
      <AppEmptyState
        className="editor-paper w-full max-w-xl border-solid bg-card/90 p-6 text-left md:p-6"
        icon={<AppLogo alt="" className="size-7" aria-hidden="true" />}
        title={t('editor.emptyTitle')}
        titleLevel={1}
        description={t('editor.emptyDescription')}
        action={
          <div className="flex w-full flex-col gap-4 text-left">
            <AppButton
              variant="secondary"
              size="sm"
              className="h-8 w-fit rounded-md"
              onClick={() => requestFileSearchFocus()}
            >
              <Search data-icon="inline-start" />
              {t('editor.emptySearch')}
            </AppButton>
            {hasVisibleFiles ? (
              <section
                aria-labelledby="editor-empty-recent-heading"
                className="flex flex-col gap-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <h2
                    id="editor-empty-recent-heading"
                    className="text-[11px] font-medium uppercase text-muted-foreground"
                  >
                    {t('editor.emptyRecent')}
                  </h2>
                  <Badge variant="outline" className="text-[10px]">
                    {visibleFiles.length}
                  </Badge>
                </div>
                <div className="grid gap-1">
                  {visibleFiles.map((file) => (
                    <AppButton
                      key={file.path}
                      variant="ghost"
                      size="sm"
                      className="h-8 justify-start rounded-md px-2 text-xs"
                      onClick={() => onOpenFile(file.path)}
                    >
                      <FileText data-icon="inline-start" />
                      <span className="truncate">{file.path}</span>
                    </AppButton>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        }
      />
    </div>
  )
}

export default EditorEmptyState
