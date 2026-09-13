import { KeepAlive } from 'keepalive-for-react'
import { useOutlet } from 'react-router-dom'
import type { LayoutContext } from '@/app/AppLayoutContext'
import { cn } from '@/lib/utils'

type AppCachedOutletProps = {
  context: LayoutContext
  routeCacheKey: string
  routeCacheMax: number
  shouldAnimateRouteCache: boolean
}

export const AppCachedOutlet = ({
  context,
  routeCacheKey,
  routeCacheMax,
  shouldAnimateRouteCache,
}: AppCachedOutletProps) => {
  const outlet = useOutlet(context)

  return (
    <KeepAlive
      activeCacheKey={routeCacheKey}
      cacheNodeClassName={cn('h-full', shouldAnimateRouteCache && 'motion-view')}
      containerClassName={cn('h-full', shouldAnimateRouteCache && 'motion-view-stack')}
      max={routeCacheMax}
    >
      {outlet}
    </KeepAlive>
  )
}
