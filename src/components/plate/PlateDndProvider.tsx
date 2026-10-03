import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { createContext, useContext } from 'react'
import type { PropsWithChildren } from 'react'

const PlateDndContext = createContext(false)

export const PlateDndProvider = ({ children }: PropsWithChildren) => {
  const hasParentProvider = useContext(PlateDndContext)

  if (hasParentProvider) return children

  return (
    <PlateDndContext.Provider value>
      <DndProvider backend={HTML5Backend}>{children}</DndProvider>
    </PlateDndContext.Provider>
  )
}
