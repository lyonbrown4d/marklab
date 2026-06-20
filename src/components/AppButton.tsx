import { forwardRef } from 'react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type AppButtonProps = ButtonProps & {
  motion?: boolean
}

const AppButton = forwardRef<HTMLButtonElement, AppButtonProps>(
  ({ className, motion = true, ...props }, ref) => (
    <Button
      ref={ref}
      className={cn(
        motion &&
          'transition-[background-color,color,border-color,box-shadow,transform] duration-150 ease-out active:scale-[0.985]',
        className,
      )}
      {...props}
    />
  ),
)

AppButton.displayName = 'AppButton'

export default AppButton
