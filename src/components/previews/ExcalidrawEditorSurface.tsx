import { Excalidraw, serializeAsJSON } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { Loader2, Save } from 'lucide-react'
import { useCallback, useRef, useState, type ComponentProps } from 'react'
import { useQuery } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { fsApi } from '@/services/fsApi'

import { parseExcalidrawDocument } from '@/components/previews/excalidrawDocument'

type ExcalidrawEditorSurfaceProps = {
  path: string
  readonly?: boolean
  title: string
}

type ExcalidrawChangeHandler = NonNullable<ComponentProps<typeof Excalidraw>['onChange']>
type ExcalidrawInitialData = ComponentProps<typeof Excalidraw>['initialData']

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unable to open Excalidraw document'

const ExcalidrawEditorSurface = ({
  path,
  readonly = false,
  title,
}: ExcalidrawEditorSurfaceProps) => {
  const latestContentRef = useRef<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const documentQuery = useQuery({
    queryKey: ['file-preview', 'excalidraw', path],
    queryFn: async () => parseExcalidrawDocument(await fsApi.readFile(path)),
    retry: false,
  })

  const handleChange = useCallback<ExcalidrawChangeHandler>((elements, appState, files) => {
    latestContentRef.current = serializeAsJSON(elements, appState, files, 'local')
    setDirty(true)
    setSaveError(null)
  }, [])

  const handleSave = useCallback(async () => {
    const content = latestContentRef.current ?? documentQuery.data?.content

    if (!content || readonly) {
      return
    }

    setSaving(true)
    setSaveError(null)

    try {
      await fsApi.updateBuffer(path, content)
      await fsApi.flushBuffers()
      setDirty(false)
    } catch (error) {
      setSaveError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }, [documentQuery.data?.content, path, readonly])

  if (documentQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading whiteboard...
      </div>
    )
  }

  if (documentQuery.isError || !documentQuery.data) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md rounded-lg border bg-card p-4 text-sm text-card-foreground shadow-sm">
          <div className="font-medium">Unable to open whiteboard</div>
          <div className="mt-2 text-muted-foreground">{errorMessage(documentQuery.error)}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center justify-between gap-3 border-b bg-card/80 px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">{title}</div>
          <div className="text-xs text-muted-foreground">
            {readonly ? 'Read only' : dirty ? 'Unsaved changes' : 'Saved'}
          </div>
        </div>
        <Button size="sm" onClick={handleSave} disabled={readonly || !dirty || saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </Button>
      </div>
      {saveError && (
        <div className="border-b bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {saveError}
        </div>
      )}
      <div className="min-h-0 flex-1">
        <Excalidraw
          initialData={documentQuery.data.initialData as ExcalidrawInitialData}
          onChange={handleChange}
          viewModeEnabled={readonly}
        />
      </div>
    </div>
  )
}

export default ExcalidrawEditorSurface
