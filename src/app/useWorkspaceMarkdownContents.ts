import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fsApi } from '@/services/fsApi'
import type { FileEntry } from '@/store/useAppStore'
import { isDesktopRuntime } from '@/runtime/environment'

export function useWorkspaceMarkdownContents(
  entries: FileEntry[],
  fileContents: Record<string, string>,
  enabled: boolean,
) {
  const desktopAvailable = isDesktopRuntime()
  const files = useMemo(() => entries.filter((entry) => entry.kind === 'file'), [entries])
  const filesKey = useMemo(() => files.map((file) => file.path).join('\n'), [files])
  const query = useQuery<Record<string, string>>({
    queryKey: ['workspace-markdown-contents', filesKey],
    queryFn: async () => {
      const loaded = await Promise.all(
        files.map(async (file) => {
          const content = await fsApi.readFile(file.path)
          return [file.path, content] as const
        }),
      )
      return Object.fromEntries(loaded)
    },
    enabled: enabled && desktopAvailable && files.length > 0,
    staleTime: 10_000,
  })

  return useMemo(
    () => (enabled ? { ...(query.data ?? {}), ...fileContents } : fileContents),
    [enabled, fileContents, query.data],
  )
}
