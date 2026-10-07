import type { ComponentProps } from 'react'

import { SheetContent } from '@/components/ui/sheet'

type AppSheetContentProps = ComponentProps<typeof SheetContent> & {
  showOverlay?: boolean
}

export const AppSheetContent = ({ showOverlay = true, ...props }: AppSheetContentProps) => (
  <SheetContent data-overlay={showOverlay ? 'visible' : 'hidden'} {...props} />
)
