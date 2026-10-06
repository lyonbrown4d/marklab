import type { ContainerModule } from 'inversify'

import { contentModule } from '@electron/di/modules/desktop/content'
import { createNativeRuntimeModule } from '@electron/di/modules/desktop/nativeRuntime'
import { scmGraphModule } from '@electron/di/modules/desktop/scmGraph'
import { workspaceModule } from '@electron/di/modules/desktop/workspace'
import type { OwnedResourceRegistry } from '@electron/di/ownedResourceRegistry'

export const createDesktopModules = (
  ownedResources: OwnedResourceRegistry,
): readonly ContainerModule[] => [
  contentModule,
  workspaceModule,
  createNativeRuntimeModule(ownedResources),
  scmGraphModule,
]
