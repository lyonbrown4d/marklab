import { Check } from 'lucide-react'
import { CommandShortcut } from '@/components/ui/command'

export const currentCommandItemClassName = 'bg-accent text-accent-foreground'

export const CommandActionShortcut = ({ label }: { label?: string }) => {
  if (!label) return null
  return <CommandShortcut>{label}</CommandShortcut>
}

export const CurrentItemCheck = () => {
  return <Check aria-hidden="true" className="ml-auto text-primary" />
}
