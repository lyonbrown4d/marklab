type MarkdownCrepeRuntime = typeof import('@/components/milkdown/createMarkdownCrepe') &
  typeof import('@/components/milkdown/configureMarkdownCrepe')

let runtimePromise: Promise<MarkdownCrepeRuntime> | null = null

export const loadMarkdownCrepeRuntime = () => {
  runtimePromise ??= Promise.all([
    import('@/components/milkdown/createMarkdownCrepe'),
    import('@/components/milkdown/configureMarkdownCrepe'),
  ])
    .then(([createModule, configureModule]) => ({
      ...createModule,
      ...configureModule,
    }))
    .catch((error: unknown) => {
      runtimePromise = null
      throw error
    })

  return runtimePromise
}

export const preloadMarkdownCrepeRuntime = () => {
  void loadMarkdownCrepeRuntime()
}
