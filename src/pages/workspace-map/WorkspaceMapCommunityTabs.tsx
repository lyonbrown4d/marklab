import { Network } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useI18n } from '@/i18n/useI18n'
import type { GraphCommunity } from '@/services/graphComputeApi'

type Props = {
  children: ReactNode
  communities: GraphCommunity[]
  links: ReadonlyMap<string, { count: number; nodeId: string }>
  onNavigateNode: (nodeId: string, viewId?: string) => void
  onSelect: (viewId: string) => void
  totalNodes: number
  viewId: string
}

export const WorkspaceMapCommunityTabs = ({
  children,
  communities,
  links,
  onNavigateNode,
  onSelect,
  totalNodes,
  viewId,
}: Props) => {
  const { t } = useI18n()
  const unlinkedPages = communities.filter((community) => community.unlinkedPage).length
  const label = (community: GraphCommunity) =>
    community.unlinkedPage
      ? `${t('workspaceMap.unlinked')}${unlinkedPages > 1 ? ` ${community.unlinkedPage}` : ''}`
      : community.label
  return (
    <Tabs
      activationMode="manual"
      className="h-full min-h-0 min-w-0 gap-0"
      value={viewId}
      onValueChange={onSelect}
    >
      <div className="flex min-w-0 shrink-0 items-center gap-2 border-b border-border/60 px-3">
        <div className="min-w-0 flex-1">
          <ScrollArea className="w-full">
            <TabsList
              aria-label={t('workspaceMap.graphTabs')}
              className="h-10 w-max justify-start rounded-none px-0"
              variant="line"
            >
              {communities.map((community) => (
                <TabsTrigger
                  className="max-w-56 flex-none gap-2 px-3 text-xs"
                  key={community.id}
                  data-graph-tab-id={community.id}
                  title={label(community)}
                  value={community.id}
                >
                  <span className="truncate">{label(community)}</span>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {community.nodeIds.length}
                  </span>
                </TabsTrigger>
              ))}
              <TabsTrigger className="flex-none px-3 text-xs" data-graph-tab-id="all" value="all">
                {t('workspaceMap.allGraph')}{' '}
                <span className="text-[10px] tabular-nums text-muted-foreground">{totalNodes}</span>
              </TabsTrigger>
            </TabsList>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
        {links.size > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-7 shrink-0 gap-1.5 px-2 text-xs" size="sm" variant="ghost">
                <Network aria-hidden="true" className="size-3.5" />
                {t('workspaceMap.relatedGraphs')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 max-w-80 overflow-y-auto">
              {communities
                .filter((community) => links.has(community.id))
                .map((community) => (
                  <DropdownMenuItem
                    key={community.id}
                    onSelect={() => onNavigateNode(links.get(community.id)!.nodeId, community.id)}
                  >
                    <span className="min-w-0 flex-1 truncate">{label(community)}</span>
                    <span className="ml-3 text-xs tabular-nums text-muted-foreground">
                      {links.get(community.id)?.count}
                    </span>
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <TabsContent
        className="relative m-0 min-h-0 flex-1"
        key={viewId}
        tabIndex={-1}
        value={viewId}
      >
        {children}
      </TabsContent>
    </Tabs>
  )
}
