import { FileText, Search } from 'lucide-react'
import AppLogo from '@/components/AppLogo'
import AppButton from '@/components/AppButton'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
      <Card className="editor-paper w-full max-w-xl gap-4 rounded-xl py-6 text-left">
        <CardHeader className="flex-row items-start gap-3 px-6">
          <AppLogo className="size-10" />
          <div className="min-w-0">
            <CardTitle className="text-base">{t('editor.emptyTitle')}</CardTitle>
            <CardDescription className="mt-1 leading-6">
              {t('editor.emptyDescription')}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-6">
          <AppButton
            variant="secondary"
            size="sm"
            className="mb-4 h-8 rounded-md"
            onClick={() => requestFileSearchFocus()}
          >
            <Search data-icon="inline-start" />
            {t('editor.emptySearch')}
          </AppButton>
          {visibleFiles.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-[11px] uppercase text-muted-foreground">
                  {t('editor.emptyRecent')}
                </div>
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
                    <FileText className="text-muted-foreground" data-icon="inline-start" />
                    <span className="truncate">{file.path}</span>
                  </AppButton>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default EditorEmptyState
