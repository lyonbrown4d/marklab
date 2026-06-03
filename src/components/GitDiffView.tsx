import { useCallback } from 'react'
import { DiffEditor } from '@monaco-editor/react'
import { FileText, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { gitApi, type GitDiffRequest } from '@/services/gitApi'
import { useDarkMode } from '@/hooks/useDarkMode'
import { useI18n } from '@/i18n/useI18n'
import { useAppStore } from '@/store/useAppStore'

type GitDiffViewProps = {
  rootPath: string
  request: GitDiffRequest
  onClose: () => void
  onOpenFile: (path: string) => void
}

const languageForPath = (path: string) => {
  const extension = path.split('.').pop()?.toLowerCase()
  if (extension === 'md' || extension === 'markdown') return 'markdown'
  if (extension === 'json') return 'json'
  if (extension === 'ts' || extension === 'tsx') return 'typescript'
  if (extension === 'js' || extension === 'jsx') return 'javascript'
  if (extension === 'css') return 'css'
  if (extension === 'html') return 'html'
  if (extension === 'rs') return 'rust'
  if (extension === 'toml') return 'toml'
  if (extension === 'yml' || extension === 'yaml') return 'yaml'
  return 'plaintext'
}

const GitDiffView = ({ rootPath, request, onClose, onOpenFile }: GitDiffViewProps) => {
  const { t } = useI18n()
  const darkMode = useDarkMode()
  const motionSmoothScrolling = useAppStore((state) => state.motionSmoothScrolling)
  const motionAnimatedCursor = useAppStore((state) => state.motionAnimatedCursor)
  const diffQuery = useQuery({
    queryKey: ['git-file-diff', rootPath, request.path, request.section],
    queryFn: () => gitApi.getFileDiff(rootPath, request.path, request.section),
    enabled: Boolean(rootPath && request.path),
  })

  const openFile = useCallback(() => {
    onOpenFile(request.path)
  }, [onOpenFile, request.path])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="tab-strip flex h-10 items-center justify-between gap-3 border-b border-border/80 px-3">
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{request.path}</span>
          <span className="shrink-0 text-muted-foreground">
            {diffQuery.data
              ? t('scm.diffRange', {
                  original: diffQuery.data.original_label,
                  modified: diffQuery.data.modified_label,
                })
              : t('scm.diffTitle')}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 rounded-md px-2 text-xs"
            onClick={openFile}
          >
            {t('scm.openFile')}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-md"
            onClick={onClose}
            aria-label={t('scm.closeDiff')}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {diffQuery.isLoading ? (
          <div className="flex h-full flex-col gap-3 p-6">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : diffQuery.isError ? (
          <div className="p-4 text-sm text-destructive">{String(diffQuery.error)}</div>
        ) : (
          <DiffEditor
            height="100%"
            language={languageForPath(request.path)}
            theme={darkMode ? 'vs-dark' : 'vs'}
            original={diffQuery.data?.original_content ?? ''}
            modified={diffQuery.data?.modified_content ?? ''}
            originalModelPath={`git://${rootPath}/HEAD/${request.path}`}
            modifiedModelPath={`git://${rootPath}/worktree/${request.path}`}
            options={{
              readOnly: true,
              renderSideBySide: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 13,
              lineNumbers: 'on',
              automaticLayout: true,
              smoothScrolling: motionSmoothScrolling,
              cursorBlinking: motionAnimatedCursor ? 'smooth' : 'blink',
              cursorSmoothCaretAnimation: motionAnimatedCursor ? 'on' : 'off',
              cursorWidth: 2,
              renderWhitespace: 'selection',
              originalEditable: false,
            }}
          />
        )}
      </div>
    </div>
  )
}

export default GitDiffView
