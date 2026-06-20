import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { useI18n } from '@/i18n/useI18n'

type EditorPaneFallbackProps = {
  label?: string
  path?: string | null
}

const EditorPaneFallback = ({ label, path }: EditorPaneFallbackProps) => {
  const { t } = useI18n()
  const loadingLabel = label ?? t('editor.loading')

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <Card className="w-full max-w-xl py-6">
        <CardContent className="flex flex-col items-center gap-4 px-6">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Spinner className="size-4" />
            <span>{loadingLabel}</span>
          </div>
          {path && (
            <div className="max-w-[min(520px,80vw)] truncate text-xs text-muted-foreground">
              {path}
            </div>
          )}
          <div className="flex w-full flex-col gap-3 pt-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default EditorPaneFallback
