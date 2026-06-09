import type { ImgHTMLAttributes } from 'react'
import { useDarkMode } from '@/hooks/useDarkMode'
import { cn } from '@/lib/utils'

type AppLogoProps = ImgHTMLAttributes<HTMLImageElement>

const AppLogo = ({ alt = 'marklab', className, src, ...props }: AppLogoProps) => {
  const darkMode = useDarkMode()
  const logoSrc = src ?? (darkMode ? '/marklab-dark.svg' : '/marklab-light.svg')

  return (
    <img
      src={logoSrc}
      alt={alt}
      draggable={false}
      className={cn('block select-none', className)}
      {...props}
    />
  )
}

export default AppLogo
