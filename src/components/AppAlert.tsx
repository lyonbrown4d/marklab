import type { ComponentProps, ReactNode } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { cn } from '@/lib/utils'

type AppAlertProps = ComponentProps<typeof Alert> & {
  children?: ReactNode
  icon?: ReactNode
  title?: ReactNode
  tone?: 'default' | 'destructive'
}

const appAlertToneClassName = {
  default: 'bg-muted/20',
  destructive: 'bg-destructive/10',
}

const AppAlert = ({
  children,
  className,
  icon,
  title,
  tone = 'default',
  ...props
}: AppAlertProps) => (
  <Alert
    {...props}
    variant={tone === 'destructive' ? 'destructive' : 'default'}
    className={cn(appAlertToneClassName[tone], className)}
  >
    {icon}
    {title && <AlertTitle>{title}</AlertTitle>}
    {children && <AlertDescription>{children}</AlertDescription>}
  </Alert>
)

export default AppAlert
