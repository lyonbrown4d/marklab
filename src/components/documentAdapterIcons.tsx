import { createElement } from 'react'
import { FileImage, FileText, Music, Video, type LucideIcon } from 'lucide-react'
import { documentAdapterForPath, type DocumentAdapterIcon } from '@/logic/documentAdapters'

type DocumentAdapterIconViewProps = {
  className?: string
  fallback?: LucideIcon
  path: string
}

const iconByAdapterIcon: Record<DocumentAdapterIcon, LucideIcon> = {
  audio: Music,
  document: FileText,
  image: FileImage,
  pdf: FileText,
  video: Video,
}

const iconForDocumentAdapterPath = (path: string, fallback: LucideIcon = FileText) => {
  const adapter = documentAdapterForPath(path)
  return adapter ? iconByAdapterIcon[adapter.icon] : fallback
}

export const DocumentAdapterIconView = ({
  className,
  fallback = FileText,
  path,
}: DocumentAdapterIconViewProps) => {
  return createElement(iconForDocumentAdapterPath(path, fallback), { className })
}
