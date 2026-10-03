import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import type { PropsWithChildren } from 'react'

export const PlateDndProvider = ({ children }: PropsWithChildren) => (
  <DndProvider backend={HTML5Backend}>{children}</DndProvider>
)
