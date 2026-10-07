import type { InlineAiProvider } from '@/components/ai/aiProviderSelection'
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
  <div className="border-t border-border/70 bg-muted/15 px-3 py-2.5">
    <div className="flex items-center gap-2">
      <Select disabled={disabled} onValueChange={onProviderChange} value={providerId}>
        <SelectTrigger aria-label={labels.provider} className="h-8 min-w-44 flex-1 text-xs">
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
    </div>
    <p className="mt-2 text-[11px] leading-4 text-muted-foreground">{labels.privacy}</p>
  </div>
)
