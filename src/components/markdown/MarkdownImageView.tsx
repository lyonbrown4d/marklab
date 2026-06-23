import { memo, useCallback, useState } from 'react'
import { ImageOff } from 'lucide-react'
import { cn } from '@/lib/utils'

type MarkdownImageViewProps = {
  src: string
  alt?: string
  title?: string
  selected?: boolean
}

const MarkdownImageView = ({ src, alt, title, selected = false }: MarkdownImageViewProps) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const failed = failedSrc === src
  const selectedClass = selected ? 'ring-1 ring-primary/35' : ''
  const handleImageError = useCallback(() => {
    setFailedSrc(src)
  }, [src])

  if (!src || failed) {
    return (
      <span
        className={cn(
          'inline-flex max-w-full items-center gap-1.5 rounded-sm border border-dashed border-border/80 bg-background/80 px-2 py-1 text-xs text-muted-foreground',
          selectedClass,
        )}
        contentEditable={false}
        data-selected={selected ? 'true' : 'false'}
        title={src || title}
      >
        <ImageOff className="size-3.5 shrink-0" />
        <span className="truncate">{alt || src || 'Image'}</span>
      </span>
    )
  }

  return (
    <span
      className={cn('inline-flex max-w-full rounded-sm p-0.5 align-middle', selectedClass)}
      contentEditable={false}
      data-selected={selected ? 'true' : 'false'}
    >
      <img
        alt={alt || ''}
        className="max-h-[28rem] max-w-full rounded-sm border border-border/80 bg-muted/35 object-contain"
        draggable={false}
        src={src}
        title={title || alt}
        onError={handleImageError}
      />
    </span>
  )
}

export default memo(MarkdownImageView)
