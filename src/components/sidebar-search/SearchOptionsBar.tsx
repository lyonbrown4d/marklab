import { CaseSensitive, Regex, WholeWord } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/AppTooltip'
import type { WorkspaceSearchOptions } from '@/components/sidebar-search/searchModel'

type SearchOptionsBarProps = {
  labels: {
    caseSensitive: string
    group: string
    regex: string
    wholeWord: string
  }
  onChange: (options: WorkspaceSearchOptions) => void
  value: WorkspaceSearchOptions
}

const optionValues = (value: WorkspaceSearchOptions): string[] => [
  ...(value.caseSensitive ? ['caseSensitive'] : []),
  ...(value.wholeWord ? ['wholeWord'] : []),
  ...(value.useRegex ? ['useRegex'] : []),
]

const SearchOptionsBar = ({ labels, onChange, value }: SearchOptionsBarProps) => {
  const handleValueChange = (next: string[]) => {
    onChange({
      caseSensitive: next.includes('caseSensitive'),
      wholeWord: next.includes('wholeWord'),
      useRegex: next.includes('useRegex'),
    })
  }
  const items = [
    { icon: CaseSensitive, label: labels.caseSensitive, value: 'caseSensitive' },
    { icon: WholeWord, label: labels.wholeWord, value: 'wholeWord' },
    { icon: Regex, label: labels.regex, value: 'useRegex' },
  ] as const

  return (
    <TooltipProvider>
      <ToggleGroup
        aria-label={labels.group}
        className="grid grid-cols-3 gap-1"
        onValueChange={handleValueChange}
        type="multiple"
        value={optionValues(value)}
        variant="outline"
      >
        {items.map(({ icon: Icon, label, value: option }) => (
          <Tooltip key={option}>
            <TooltipTrigger asChild>
              <ToggleGroupItem
                aria-label={label}
                className="h-7 min-w-0 gap-1 rounded-md px-1.5 text-[10px] font-normal data-[state=on]:border-primary/30 data-[state=on]:bg-primary/10 data-[state=on]:text-foreground"
                value={option}
              >
                <Icon aria-hidden="true" className="size-3.5" />
                <span className="truncate">{label}</span>
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>
    </TooltipProvider>
  )
}

export default SearchOptionsBar
