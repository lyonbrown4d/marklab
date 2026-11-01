import { createContext, useContext } from 'react'

const ActiveWorkspaceContext = createContext<string | null>(null)

export const ActiveWorkspaceProvider = ActiveWorkspaceContext.Provider
export const useActiveWorkspaceKey = () => useContext(ActiveWorkspaceContext)
