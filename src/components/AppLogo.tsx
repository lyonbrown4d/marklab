import type { ImgHTMLAttributes } from 'react'
import { useDarkMode } from '@/hooks/useDarkMode'
import { cn } from '@/lib/utils'

type AppLogoProps = ImgHTMLAttributes<HTMLImageElement>

const publicAssetUrl = (name: string) => new URL(name, document.baseURI).toString()

const AppLogo = ({ alt = 'marklab', className, src, ...props }: AppLogoProps) => {
  const darkMode = useDarkMode()
  const logoSrc = src ?? publicAssetUrl(darkMode ? 'marklab-dark.svg' : 'marklab-light.svg')

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
