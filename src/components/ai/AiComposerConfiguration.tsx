import { Settings2 } from 'lucide-react'
import type { InlineAiProvider } from '@/components/ai/aiProviderSelection'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type AiComposerConfigurationProps = {
  disabled: boolean
  labels: {
    configuration: string
    privacy: string
    provider: string
  }
  onProviderChange: (providerId: string) => void
  providerId: string
  providers: InlineAiProvider[]
}

export const AiComposerConfiguration = ({
  disabled,
  labels,
  onProviderChange,
  providerId,
  providers,
}: AiComposerConfigurationProps) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button
        aria-label={labels.configuration}
        disabled={disabled}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <Settings2 aria-hidden="true" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-72 space-y-2 p-3">
      <Select disabled={disabled} onValueChange={onProviderChange} value={providerId}>
        <SelectTrigger aria-label={labels.provider} className="h-8 w-full text-xs">
          <SelectValue placeholder={labels.provider} />
        </SelectTrigger>
        <SelectContent>
          {providers.map((provider) => (
            <SelectItem key={provider.id} value={provider.id}>
              {provider.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-[11px] leading-4 text-muted-foreground">{labels.privacy}</p>
    </PopoverContent>
  </Popover>
)
