type SearchIndexBuild = (isCurrent: () => boolean) => Promise<boolean>

export class WorkspaceSearchIndexBuildCoordinator {
  private activeBuild: { searchKey: string; task: Promise<boolean> } | null = null
  private generation = 0

  run(searchKey: string, build: SearchIndexBuild): Promise<boolean> {
    if (this.activeBuild?.searchKey === searchKey) return this.activeBuild.task

    const generation = ++this.generation
    const isCurrent = () => generation === this.generation
    const task = build(isCurrent)
    this.activeBuild = { searchKey, task }
    const clearBuild = (): void => {
      if (this.activeBuild?.task === task) this.activeBuild = null
    }
    void task.then(clearBuild, clearBuild)
    return task
  }

  invalidate(): void {
    this.generation += 1
    this.activeBuild = null
  }
}
