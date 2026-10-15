import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useI18n } from '@/i18n/useI18n'
import type { GitDiffRequest } from '@/services/gitApi'
import { GitQueryState } from '@/components/git/GitQueryState'
import { useConflictResolution } from '@/features/git/conflicts/useConflictResolution'
import {
  conflictChoiceContent,
  type ConflictBlock,
  type ConflictChoice,
} from '@/features/git/conflicts/conflictMarkers'
import {
  ConflictResultEditor,
  type ConflictEditorHandle,
} from '@/features/git/conflicts/ConflictResultEditor'
import { ConflictChoiceList } from '@/features/git/conflicts/ConflictChoiceList'
import {
  ConflictResolutionDialogs,
  type ConflictDialog,
} from '@/features/git/conflicts/ConflictResolutionDialogs'
import {
  approveGitConflictClose,
  cancelGitConflictClose,
  registerGitConflictCloseHandler,
} from '@/features/git/conflicts/conflictDraftStore'

type Props = {
  rootPath: string
  request: GitDiffRequest
  onClose: () => void
  onOpenFile?: (path: string) => void
}
type Side = 'ours' | 'theirs' | 'base'

const ConflictWorkspaceView = ({ rootPath, request, onClose }: Props) => {
  const { t } = useI18n()
  const [side, setSide] = useState<Side>('ours')
  const [dialog, setDialog] = useState<ConflictDialog>(null)
  const [editorReady, setEditorReady] = useState(false)
  const editorRef = useRef<ConflictEditorHandle | null>(null)
  const close = () => {
    if (!approveGitConflictClose(rootPath, request.path)) onClose()
  }
  const state = useConflictResolution(rootPath, request.path, close)
  const { draft, query, pending, error, blocks, unresolved, stale, update, save, discard, reload } =
    state
  useEffect(
    () => registerGitConflictCloseHandler(rootPath, request.path, () => setDialog('close')),
    [rootPath, request.path],
  )
  const askClose = () => {
    if (pending) return
    if (draft?.dirty) setDialog('close')
    else close()
  }
  const cancel = () => {
    cancelGitConflictClose(rootPath, request.path)
    setDialog(null)
  }
  const chooseBlock = (block: ConflictBlock, choice: ConflictChoice) => {
    if (pending || !draft || !editorReady) return
    const replacement = conflictChoiceContent(block, choice)
    editorRef.current?.replace(block.start, block.end, replacement)
  }
  const chooseSide = (chosen: Side) => {
    if (!draft || pending || !editorReady || !state.canWrite) return
    const content = draft.snapshot[chosen]
    if (content === null) {
      setDialog('delete')
      return
    }
    editorRef.current?.replaceAll(content)
    update(content)
  }
  const saveAndClose = async () => {
    if (await save()) {
      setDialog(null)
      close()
    }
  }
  const confirmDelete = () => {
    if (pending || !editorReady) return
    editorRef.current?.replaceAll('')
    update('', true, true)
    setDialog(null)
  }
  const canSave = Boolean(
    state.canWrite && draft && editorReady && (!draft.deleteFile || draft.deletionConfirmed),
  )
  return (
    <section
      className="flex h-full min-h-0 flex-col overflow-hidden pt-9"
      aria-label={t('scm.merge.title')}
      aria-busy={pending}
      onKeyDownCapture={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
          event.preventDefault()
          event.stopPropagation()
          if (canSave && !pending) void save()
        }
      }}
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0 flex-1 text-xs">
          <h2 className="truncate font-medium">
            {t('scm.merge.title')}: {request.path}
          </h2>
          <p className="text-muted-foreground">
            {t(draft?.dirty ? 'scm.merge.unsaved' : 'scm.merge.saved')}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !canSave}
            onClick={() => {
              void save()
            }}
          >
            {t('scm.merge.save')}
          </Button>
          <Button
            size="sm"
            disabled={pending || !canSave || unresolved}
            onClick={() => {
              void save(true)
            }}
          >
            {t('scm.merge.saveAndStage')}
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={askClose}>
            {t('scm.management.close')}
          </Button>
        </div>
      </header>
      {!draft ? (
        <GitQueryState
          loading={query.isLoading || query.isFetching}
          error={query.error}
          onRetry={() => {
            void query.refetch()
          }}
        />
      ) : (
        <Tabs
          value={side}
          onValueChange={(value) => setSide(value as Side)}
          className="min-h-0 flex-1 gap-0"
        >
          <div className="max-h-[40%] shrink-0 space-y-1 overflow-auto border-b border-border px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <TabsList aria-label={t('scm.merge.comparison')}>
                {(['ours', 'theirs', 'base'] as const).map((value) => (
                  <TabsTrigger key={value} value={value}>
                    {t(`scm.merge.side.${value}`)}
                  </TabsTrigger>
                ))}
              </TabsList>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                disabled={pending || !editorReady || !state.canWrite}
                onClick={() => chooseSide('ours')}
              >
                {t('scm.merge.useOurs')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                disabled={pending || !editorReady || !state.canWrite}
                onClick={() => chooseSide('theirs')}
              >
                {t('scm.merge.useTheirs')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                disabled={pending}
                onClick={() => {
                  if (draft.dirty) setDialog('reload')
                  else void reload()
                }}
              >
                {t('scm.merge.reload')}
              </Button>
            </div>
            <p className="text-muted-foreground">{t('scm.merge.help')}</p>
            {draft.verified && draft.snapshot[side] === null && (
              <p>{t('scm.merge.sideDeleted', { side: t(`scm.merge.side.${side}`) })}</p>
            )}
            {draft.deleteFile && (
              <p role="status" className="text-destructive">
                {t(
                  draft.deletionConfirmed
                    ? 'scm.merge.deletionSelected'
                    : 'scm.merge.deletionUnconfirmed',
                )}
              </p>
            )}
            {unresolved && (
              <p role="status">{t('scm.merge.unresolved', { count: blocks.length })}</p>
            )}
            {stale && (
              <p role="alert" className="text-destructive">
                {t('scm.merge.stale')}
              </p>
            )}
            {error || query.error ? (
              <p role="alert" className="break-words text-destructive">
                {String(error ?? query.error)}
              </p>
            ) : null}
            {pending && <p role="status">{t('scm.management.working')}</p>}
          </div>
          <ConflictChoiceList
            blocks={blocks}
            disabled={pending || !editorReady}
            onChoose={chooseBlock}
            onReveal={(line) => editorRef.current?.reveal(line)}
          />
          <TabsContent value={side} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div
              className="flex min-h-24 flex-1 flex-col overflow-hidden"
              role="region"
              aria-label={t('scm.merge.result')}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-1 text-xs font-medium">
                <span>{t('scm.merge.result')}</span>
                {draft.deleteFile && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1 text-xs"
                    disabled={pending || !editorReady}
                    onClick={() => {
                      editorRef.current?.replaceAll('')
                      update('')
                    }}
                  >
                    {t('scm.merge.keepEmpty')}
                  </Button>
                )}
              </div>
              <div className="min-h-0 flex-1">
                <ConflictResultEditor
                  rootPath={rootPath}
                  path={request.path}
                  original={draft.snapshot[side] ?? ''}
                  content={draft.content}
                  pending={pending}
                  editorRef={editorRef}
                  onChange={(content) => update(content)}
                  onReady={() => setEditorReady(true)}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      )}
      <ConflictResolutionDialogs
        dialog={dialog}
        pending={pending}
        error={error}
        canSave={canSave}
        onCancel={cancel}
        onSave={() => {
          void saveAndClose()
        }}
        onDiscard={() => {
          discard()
          setDialog(null)
          close()
        }}
        onDelete={confirmDelete}
        onReload={() => {
          void reload().then((success) => {
            if (success) setDialog(null)
          })
        }}
      />
    </section>
  )
}

export const GitConflictMergeView = (props: Props) => (
  <ConflictWorkspaceView key={`${props.rootPath}\0${props.request.path}`} {...props} />
)
export default GitConflictMergeView
