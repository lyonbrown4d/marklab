import * as React from 'react'
import * as SwitchPrimitives from '@radix-ui/react-switch'
import { cn } from '@/lib/utils'
import styles from '@/components/settings/SettingsSwitch.module.scss'

type SettingsSwitchProps = React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>

export const SettingsSwitch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  SettingsSwitchProps
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root ref={ref} className={cn(styles.root, className)} {...props}>
    <SwitchPrimitives.Thumb className={styles.thumb} />
  </SwitchPrimitives.Root>
))

SettingsSwitch.displayName = SwitchPrimitives.Root.displayName

export default SettingsSwitch
