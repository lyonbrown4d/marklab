import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, Save, ShieldAlert } from 'lucide-react'
import {
  createDrawioLoadMessage,
  createDrawioSaveRequestMessage,
  createDrawioStatusMessage,
  parseDrawioFrameMessage,
  resolveDrawioEmbedUrl,
  serializeDrawioMessage,
} from '@/logic/drawioEmbed'
import { drawioDocumentApi } from '@/services/drawioDocumentApi'
import { fsApi } from '@/services/fsApi'
import { useDrawioSettingsStore } from '@/store/useDrawioSettingsStore'
import { useI18n } from '@/i18n/useI18n'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

type DrawioEditorSurfaceProps = {
  path: string
  readonly: boolean
  title: string
}

type SaveState = 'clean' | 'dirty' | 'error' | 'saving'

const DrawioEditorSurface = ({ path, readonly, title }: DrawioEditorSurfaceProps) => {
  const { t } = useI18n()
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const loadedKeyRef = useRef('')
  const drawioEditorMode = useDrawioSettingsStore((state) => state.drawioEditorMode)
  const drawioEmbedUrl = useDrawioSettingsStore((state) => state.drawioEmbedUrl)
  const embedUrl = useMemo(() => resolveDrawioEmbedUrl(drawioEmbedUrl), [drawioEmbedUrl])
  const [frameReady, setFrameReady] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('clean')
  const [message, setMessage] = useState<string | null>(null)
  const remoteEnabled = drawioEditorMode === 'remote' && embedUrl.ok

  const documentQuery = useQuery({
    queryKey: ['drawio-document', path],
    queryFn: () => drawioDocumentApi.load(path),
    enabled: remoteEnabled,
    staleTime: 0,
  })

  const postToFrame = useCallback(
    (payload: Parameters<typeof serializeDrawioMessage>[0]) => {
      if (!embedUrl.ok) return
      iframeRef.current?.contentWindow?.postMessage(
        serializeDrawioMessage(payload),
        embedUrl.origin,
      )
    },
    [embedUrl],
  )

  const openInSystem = useCallback(() => {
    void fsApi.openPathInSystem(path)
  }, [path])

  const saveXml = useCallback(
    async (xml: string, flush: boolean) => {
      if (readonly) {
        setSaveState('error')
        setMessage(t('preview.drawioReadOnlyDescription'))
        postToFrame(createDrawioStatusMessage(t('preview.drawioReadOnly'), true))
        return
      }

      setSaveState(flush ? 'saving' : 'dirty')
      setMessage(flush ? t('preview.drawioSaving') : t('preview.drawioUnsaved'))
      try {
        const result = await drawioDocumentApi.save({ flush, path, xml })
        setSaveState(result.dirty ? 'dirty' : 'clean')
        setMessage(result.dirty ? t('preview.drawioUnsaved') : t('preview.drawioSaved'))
        postToFrame(createDrawioStatusMessage(t('preview.drawioSaved'), result.dirty))
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        setSaveState('error')
        setMessage(errorMessage)
        postToFrame(createDrawioStatusMessage(errorMessage, true))
      }
    },
    [path, postToFrame, readonly, t],
  )

  useEffect(() => {
    if (!remoteEnabled || !embedUrl.ok) return

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== embedUrl.origin) return
      if (event.source !== iframeRef.current?.contentWindow) return

      const frameMessage = parseDrawioFrameMessage(event.data)
      if (!frameMessage) return

      if (frameMessage.event === 'init') {
        setFrameReady(true)
        return
      }
      if (
        frameMessage.event === 'save' ||
        frameMessage.event === 'export' ||
        frameMessage.event === 'autosave'
      ) {
        if (!frameMessage.xml) {
          if (frameMessage.event === 'save') {
            postToFrame(createDrawioSaveRequestMessage())
            return
          }
          setSaveState('error')
          setMessage(t('preview.drawioMissingXml'))
          return
        }
        void saveXml(frameMessage.xml, frameMessage.event !== 'autosave')
        return
      }
      if (frameMessage.event === 'exit') {
        setMessage(frameMessage.message ?? null)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [embedUrl, postToFrame, remoteEnabled, saveXml, t])

  useEffect(() => {
    if (!remoteEnabled || !embedUrl.ok || !frameReady || documentQuery.data == null) return

    const loadKey = `${path}:${embedUrl.url}:${documentQuery.dataUpdatedAt}`
    if (loadedKeyRef.current === loadKey) return
    loadedKeyRef.current = loadKey
    postToFrame(
      createDrawioLoadMessage({
        title,
        xml: documentQuery.data,
      }),
    )
  }, [
    documentQuery.data,
    documentQuery.dataUpdatedAt,
    embedUrl,
    frameReady,
    path,
    postToFrame,
    readonly,
    remoteEnabled,
    title,
  ])

  if (drawioEditorMode === 'system') {
    return (
      <DrawioMessageCard
        title={t('preview.drawioDisabledTitle')}
        description={t('preview.drawioDisabledDescription')}
        actionLabel={t('preview.openInSystem')}
        onAction={openInSystem}
      />
    )
  }

  if (!embedUrl.ok) {
    return (
      <DrawioMessageCard
        title={t('preview.drawioRemoteUrlInvalid')}
        description={embedUrl.error}
        actionLabel={t('preview.openInSystem')}
        onAction={openInSystem}
      />
    )
  }

  const loadingLabel = documentQuery.isLoading
    ? t('preview.drawioLoadingDocument')
    : t('preview.drawioLoadingEditor')

  return (
    <div className="flex h-full min-h-[32rem] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border/80 bg-background/80 px-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{t('preview.drawioEditorDescription')}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {message ??
              (documentQuery.isLoading || !frameReady
                ? t('preview.drawioLoadingEditor')
                : t('preview.drawioSaved'))}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {readonly ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground">
              <ShieldAlert className="size-3" />
              {t('preview.drawioReadOnly')}
            </span>
          ) : (
            <span
              className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground"
              data-save-state={saveState}
            >
              {saveState === 'dirty'
                ? t('preview.drawioUnsaved')
                : saveState === 'saving'
                  ? t('preview.drawioSaving')
                  : saveState === 'error'
                    ? t('preview.failed')
                    : t('preview.drawioSaved')}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5"
            disabled={readonly || !frameReady || documentQuery.isLoading}
            onClick={() => postToFrame(createDrawioSaveRequestMessage())}
          >
            <Save data-icon="inline-start" />
            {t('preview.drawioSave')}
          </Button>
        </div>
      </div>

      {documentQuery.isError ? (
        <DrawioInlineError message={t('preview.failed')} />
      ) : (
        <div className="relative min-h-0 flex-1 bg-background">
          {(documentQuery.isLoading || !frameReady) && (
            <div
              aria-busy="true"
              aria-label={loadingLabel}
              className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-background/70 text-sm text-muted-foreground backdrop-blur-sm"
              role="status"
            >
              <Spinner aria-hidden="true" role="presentation" />
              {loadingLabel}
            </div>
          )}
          <iframe
            key={`${embedUrl.url}:${path}`}
            ref={iframeRef}
            title={t('preview.drawioFrameTitle', { name: title })}
            src={embedUrl.url}
            className="h-full w-full border-0"
            sandbox="allow-downloads allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
            allow="clipboard-read; clipboard-write"
            referrerPolicy="no-referrer"
            onLoad={() => {
              setFrameReady(false)
              loadedKeyRef.current = ''
            }}
          />
        </div>
      )}
    </div>
  )
}

const DrawioMessageCard = ({
  actionLabel,
  description,
  onAction,
  title,
}: {
  actionLabel: string
  description: string
  onAction: () => void
  title: string
}) => (
  <div className="flex min-h-full items-center justify-center p-4">
    <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm">
      <div className="text-sm font-semibold">{title}</div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      <Button variant="outline" size="sm" className="mt-4 h-8 gap-1.5" onClick={onAction}>
        <ExternalLink data-icon="inline-start" />
        {actionLabel}
      </Button>
    </div>
  </div>
)

const DrawioInlineError = ({ message }: { message: string }) => (
  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
    {message}
  </div>
)

export default DrawioEditorSurface
