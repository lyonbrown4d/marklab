import { AlertTriangle, ArrowUpRight, FileText, Link2, ListTree } from 'lucide-react'
import {
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import { useI18n } from '@/i18n/useI18n'
import { createFileLabel } from '@/logic/paths'

export type CommandNavigationHeading = {
  path: string
  slug: string
  text: string
  level: number
}

export type CommandNavigationOutgoingLink = {
  sourcePath: string
  targetPath: string
  targetAnchor?: string | null
  targetHeadingSlug?: string | null
  target: string
  text: string
  context: string
  line: number
  column: number
  linkType: 'markdown' | 'wiki'
}

export type CommandNavigationBacklink = {
  sourcePath: string
  text: string
  context: string
  line: number
  column: number
  targetAnchor?: string | null
}

export type CommandNavigationMissingLink = {
  path: string
  target: string
  text: string
  context: string
  line: number
  column: number
  linkType: 'markdown' | 'wiki'
}

type CommandNavigationSectionProps = {
  activePath: string | null
  headings: CommandNavigationHeading[]
  outgoingLinks: CommandNavigationOutgoingLink[]
  backlinks: CommandNavigationBacklink[]
  missingLinks: CommandNavigationMissingLink[]
  onOpenHeading: (path: string, slug: string) => void
  onOpenOutgoingLink: (link: CommandNavigationOutgoingLink) => void
  onOpenBacklink: (backlink: CommandNavigationBacklink) => void
  onOpenMissingLink: (missingLink: CommandNavigationMissingLink) => void
}

const MAX_NAVIGATION_ITEMS = 6

export const CommandNavigationSection = ({
  activePath,
  headings,
  outgoingLinks,
  backlinks,
  missingLinks,
  onOpenHeading,
  onOpenOutgoingLink,
  onOpenBacklink,
  onOpenMissingLink,
}: CommandNavigationSectionProps) => {
  const { t } = useI18n()
  if (!activePath) return null

  const visibleHeadings = headings.slice(0, MAX_NAVIGATION_ITEMS)
  const visibleOutgoingLinks = outgoingLinks.slice(0, MAX_NAVIGATION_ITEMS)
  const visibleBacklinks = backlinks.slice(0, MAX_NAVIGATION_ITEMS)
  const visibleMissingLinks = missingLinks.slice(0, MAX_NAVIGATION_ITEMS)

  if (
    visibleHeadings.length === 0 &&
    visibleOutgoingLinks.length === 0 &&
    visibleBacklinks.length === 0 &&
    visibleMissingLinks.length === 0
  ) {
    return null
  }

  return (
    <>
      {visibleHeadings.length > 0 && (
        <CommandGroup heading={t('command.navigation.currentHeadings')}>
          {visibleHeadings.map((heading) => (
            <CommandItem
              key={`${heading.path}#${heading.slug}`}
              value={`current heading ${heading.text} ${heading.slug} ${heading.path}`}
              onSelect={() => onOpenHeading(heading.path, heading.slug)}
            >
              <ListTree className="size-4" />
              <span className="min-w-0 flex-1 truncate">{heading.text}</span>
              <CommandShortcut>H{heading.level}</CommandShortcut>
            </CommandItem>
          ))}
          <HiddenCount count={headings.length - visibleHeadings.length} />
        </CommandGroup>
      )}
      {visibleOutgoingLinks.length > 0 && (
        <CommandGroup heading={t('command.navigation.outgoingLinks')}>
          {visibleOutgoingLinks.map((link, index) => (
            <CommandItem
              key={`${link.sourcePath}:${link.line}:${link.column}:${index}`}
              value={`outgoing link reference ${link.targetPath} ${link.target} ${link.text} ${link.context} ${link.targetHeadingSlug ?? link.targetAnchor ?? ''}`}
              onSelect={() => onOpenOutgoingLink(link)}
            >
              <ArrowUpRight className="size-4" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">
                  {link.text || createFileLabel(link.targetPath)}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {createFileLabel(link.targetPath)}
                  {link.targetHeadingSlug ? `#${link.targetHeadingSlug}` : ''}
                </span>
              </span>
              <CommandShortcut>
                L{link.line}:C{link.column}
              </CommandShortcut>
            </CommandItem>
          ))}
          <HiddenCount count={outgoingLinks.length - visibleOutgoingLinks.length} />
        </CommandGroup>
      )}
      {visibleBacklinks.length > 0 && (
        <CommandGroup heading={t('command.navigation.backlinks')}>
          {visibleBacklinks.map((backlink, index) => (
            <CommandItem
              key={`${backlink.sourcePath}:${backlink.line}:${backlink.column}:${index}`}
              value={`backlink mention reference ${backlink.sourcePath} ${backlink.text} ${backlink.context} ${backlink.targetAnchor ?? ''}`}
              onSelect={() => onOpenBacklink(backlink)}
            >
              <Link2 className="size-4" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{createFileLabel(backlink.sourcePath)}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {backlink.context || backlink.text}
                </span>
              </span>
              <CommandShortcut>
                L{backlink.line}:C{backlink.column}
              </CommandShortcut>
            </CommandItem>
          ))}
          <HiddenCount count={backlinks.length - visibleBacklinks.length} />
        </CommandGroup>
      )}
      {visibleMissingLinks.length > 0 && (
        <CommandGroup heading={t('command.navigation.missingLinks')}>
          {visibleMissingLinks.map((link, index) => (
            <CommandItem
              key={`${link.path}:${link.line}:${link.column}:${index}`}
              value={`missing link unresolved ${link.linkType} ${link.target} ${link.text} ${link.context}`}
              onSelect={() => onOpenMissingLink(link)}
            >
              {link.linkType === 'wiki' ? (
                <FileText className="size-4" />
              ) : (
                <AlertTriangle className="size-4" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{link.text || link.target}</span>
                <span className="block truncate text-xs text-muted-foreground">{link.target}</span>
              </span>
              <CommandShortcut>
                L{link.line}:C{link.column}
              </CommandShortcut>
            </CommandItem>
          ))}
          <HiddenCount count={missingLinks.length - visibleMissingLinks.length} />
        </CommandGroup>
      )}
      <CommandSeparator />
    </>
  )
}

const HiddenCount = ({ count }: { count: number }) => {
  const { t } = useI18n()
  if (count <= 0) return null
  return (
    <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
      {t('command.search.moreHidden', { count })}
    </div>
  )
}

export default CommandNavigationSection
