import type { LayoutContext } from '@/app/AppLayout'
import NotFoundPage from '@/pages/NotFoundPage'

export const fileExists = (files: LayoutContext['files'], path: string | null) =>
  Boolean(path && files.some((file) => file.kind === 'file' && file.path === path))

export const isFileRouteAvailable = (
  files: LayoutContext['files'],
  requestedPath: string | null,
  activePath: string | null,
) => Boolean(requestedPath && (requestedPath === activePath || fileExists(files, requestedPath)))

export const FileRouteNotFound = ({
  files,
  onOpenFile,
}: {
  files: LayoutContext['files']
  onOpenFile: (path: string) => void
}) => <NotFoundPage files={files.filter((file) => file.kind === 'file')} onOpenFile={onOpenFile} />
