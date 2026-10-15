import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createTwoFilesPatch } from 'diff'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/useI18n'
import { gitApiForWorkspace } from '@/services/gitApi'
import type { GitCommitSummary, GitCommitFile } from '@/types/gitOperations'
import { GitQueryState } from '@/components/git/GitQueryState'

type Props = { rootPath: string; commit: GitCommitSummary }

const CommitFileDiff = ({ rootPath, commit, file }: Props & { file: GitCommitFile }) => {
  const { t } = useI18n()
  const api = useMemo(() => gitApiForWorkspace(rootPath), [rootPath])
  const query = useQuery({
    queryKey: ['git-commit-diff', rootPath, commit.hash, file.path, file.old_path],
    queryFn: () => api.getCommitDiff(commit.hash, file.path, file.old_path ?? undefined),
  })
  const patch =
    query.data &&
    createTwoFilesPatch(
      query.data.original_label,
      query.data.modified_label,
      query.data.original_content,
      query.data.modified_content,
      undefined,
      undefined,
      { context: 5 },
    )
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
      <GitQueryState
        loading={query.isLoading}
        error={query.error}
        onRetry={() => {
          void query.refetch()
        }}
      />
      {patch && (
        <pre
          tabIndex={0}
          aria-label={t('scm.history.diff', { path: file.path })}
          className="select-text p-3 font-mono text-xs leading-5"
        >
          {patch}
        </pre>
      )}
    </div>
  )
}

export const GitCommitDetails = ({ rootPath, commit }: Props) => {
  const { t } = useI18n()
  const api = useMemo(() => gitApiForWorkspace(rootPath), [rootPath])
  const [selected, setSelected] = useState<GitCommitFile | null>(null)
  const query = useQuery({
    queryKey: ['git-commit-files', rootPath, commit.hash],
    queryFn: () => api.getCommitFiles(commit.hash),
  })
  const file = selected ?? query.data?.[0]
  return (
    <section aria-label={t('scm.history.files')} className="flex min-h-0 flex-1 flex-col gap-2">
      <h3 className="shrink-0 break-all text-xs font-medium">
        {commit.shortHash} · {commit.subject}
      </h3>
      <GitQueryState
        loading={query.isLoading}
        error={query.error}
        empty={query.data?.length === 0}
        onRetry={() => {
          void query.refetch()
        }}
      />
      <ul className="max-h-[min(7rem,35%)] shrink-0 overflow-auto">
        {query.data?.map((item) => (
          <li key={item.path}>
            <Button
              size="sm"
              variant={item.path === file?.path ? 'secondary' : 'ghost'}
              aria-pressed={item.path === file?.path}
              className="h-auto w-full justify-start gap-2 px-2 py-1 text-left text-xs"
              onClick={() => setSelected(item)}
            >
              <span className="shrink-0 font-mono">{item.status}</span>
              <span className="break-all whitespace-normal">
                {item.old_path ? `${item.old_path} → ${item.path}` : item.path}
              </span>
            </Button>
          </li>
        ))}
      </ul>
      {file && <CommitFileDiff key={file.path} rootPath={rootPath} commit={commit} file={file} />}
    </section>
  )
}
