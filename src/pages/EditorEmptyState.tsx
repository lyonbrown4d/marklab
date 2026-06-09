import { FileText, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import AppLogo from '@/components/AppLogo'
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

  return (
    <div className="editor-stage flex h-full items-center justify-center p-6">
      <div className="editor-paper w-full max-w-xl rounded-md p-6 text-left">
        <div className="mb-4 flex items-start gap-3">
          <AppLogo className="h-10 w-10 rounded-md shadow-sm" />
          <div className="min-w-0">
            <div className="text-base font-semibold">{t('editor.emptyTitle')}</div>
            <div className="mt-1 text-sm leading-6 text-muted-foreground">
              {t('editor.emptyDescription')}
            </div>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="mb-4 h-8 rounded-md"
          onClick={() => requestFileSearchFocus()}
        >
          <Search className="h-4 w-4" />
          {t('editor.emptySearch')}
        </Button>
        {visibleFiles.length > 0 && (
          <div>
            <div className="mb-2 text-[11px] uppercase text-muted-foreground">
              {t('editor.emptyRecent')}
            </div>
            <div className="grid gap-1">
              {visibleFiles.map((file) => (
                <Button
                  key={file.path}
                  variant="ghost"
                  size="sm"
                  className="h-8 justify-start rounded-md px-2 text-xs"
                  onClick={() => onOpenFile(file.path)}
                >
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{file.path}</span>
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default EditorEmptyState
