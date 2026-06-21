import * as React from 'react'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

type SettingsSwitchProps = React.ComponentPropsWithoutRef<typeof Switch>

export const SettingsSwitch = React.forwardRef<
  React.ElementRef<typeof Switch>,
  SettingsSwitchProps
>(({ className, ...props }, ref) => (
  <Switch
    ref={ref}
    className={cn('data-[state=unchecked]:bg-foreground/25', className)}
    {...props}
  />
))

SettingsSwitch.displayName = 'SettingsSwitch'

export default SettingsSwitch
