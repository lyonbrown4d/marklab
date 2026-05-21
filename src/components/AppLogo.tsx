import type { ImgHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type AppLogoProps = ImgHTMLAttributes<HTMLImageElement>

const AppLogo = ({ alt = 'marklab', className, ...props }: AppLogoProps) => {
  return (
    <img
      src="/marklab.svg"
      alt={alt}
      draggable={false}
      className={cn('block select-none', className)}
      {...props}
    />
  )
}

export default AppLogo
