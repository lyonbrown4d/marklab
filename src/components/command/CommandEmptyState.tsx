import { SearchX } from 'lucide-react'
import AppEmptyState from '@/components/AppEmptyState'
import { Button } from '@/components/ui/button'

export type CommandEmptyScopeSuggestion = {
  label: string
  marker: string
  value: string
}

type CommandEmptyStateProps = {
  description: string
  onSelectScope: (value: string) => void
  suggestions: CommandEmptyScopeSuggestion[]
  title: string
}

const CommandEmptyState = ({
  description,
  onSelectScope,
  suggestions,
  title,
}: CommandEmptyStateProps) => (
  <div className="px-6 py-8">
    <AppEmptyState
      compact
      className="min-h-0 border-0 bg-transparent p-0 md:p-0"
      description={description}
      descriptionClassName="max-w-sm"
      icon={<SearchX aria-hidden="true" />}
      mediaClassName="mb-0 text-muted-foreground"
      title={title}
      titleClassName="text-sm"
      titleLevel={2}
      action={
        <div className="flex flex-wrap justify-center gap-1.5">
          {suggestions.map((suggestion) => (
            <Button
              key={suggestion.marker}
              type="button"
              size="sm"
              variant="outline"
              aria-label={`${suggestion.marker} ${suggestion.label}`}
              className="command-empty-scope-button h-7 rounded px-2"
              onClick={() => onSelectScope(suggestion.value)}
            >
              <span className="command-empty-scope-marker">{suggestion.marker}</span>
              <span>{suggestion.label}</span>
            </Button>
          ))}
        </div>
      }
    />
  </div>
)

export default CommandEmptyState
