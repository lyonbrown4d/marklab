import { Check, ChevronsUpDown } from 'lucide-react'
import { useState } from 'react'
import { codeLanguageCatalog, codeLanguageLabel } from '@/components/plate/code/codeLanguageCatalog'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

type CodeLanguagePickerProps = {
  emptyLabel: string
  language: string
  searchLabel: string
  onChange: (language: string) => void
}

export const CodeLanguagePicker = ({
  emptyLabel,
  language,
  searchLabel,
  onChange,
}: CodeLanguagePickerProps) => {
  const [open, setOpen] = useState(false)
  const label = codeLanguageLabel(language)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-expanded={open}
          className="max-w-36 justify-between"
          size="xs"
          type="button"
          variant="ghost"
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown aria-hidden="true" data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0" contentEditable={false}>
        <Command>
          <CommandInput aria-label={searchLabel} placeholder={searchLabel} />
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup>
              {codeLanguageCatalog.map((option) => (
                <CommandItem
                  key={option.id || 'plaintext'}
                  keywords={[option.id, ...(option.aliases ?? [])]}
                  onSelect={() => {
                    onChange(option.id)
                    setOpen(false)
                  }}
                  value={option.label}
                >
                  <Check
                    aria-hidden="true"
                    className={cn(language === option.id ? 'opacity-100' : 'opacity-0')}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
