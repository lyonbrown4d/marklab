import type { ElementType, ReactNode } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export type SettingsShellSection = {
  value: string
  label: string
  icon: ElementType<{ className?: string }>
  content: ReactNode
}

type SettingsShellProps = {
  defaultValue: string
  sections: SettingsShellSection[]
}

const SettingsShell = ({ defaultValue, sections }: SettingsShellProps) => {
  return (
    <Tabs defaultValue={defaultValue} className="settings-dialog-body min-h-0 overflow-hidden">
      <TabsList className="settings-dialog-tabs flex h-full flex-col items-stretch justify-start rounded-none border-r border-border bg-muted/35 p-2">
        {sections.map((section) => {
          const Icon = section.icon
          return (
            <TabsTrigger
              key={section.value}
              value={section.value}
              className="settings-dialog-tab-trigger justify-start gap-2 rounded-md"
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{section.label}</span>
            </TabsTrigger>
          )
        })}
      </TabsList>

      <div className="min-h-0 min-w-0 overflow-hidden">
        {sections.map((section) => (
          <TabsContent key={section.value} value={section.value} className="m-0 min-h-0">
            <ScrollArea className="h-full" viewportClassName="h-full">
              <div className="settings-dialog-panel mx-auto w-full max-w-3xl p-5">
                {section.content}
              </div>
            </ScrollArea>
          </TabsContent>
        ))}
      </div>
    </Tabs>
  )
}

export default SettingsShell
