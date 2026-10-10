import { vi } from 'vitest'

export const createSingleInstanceTestWindow = () => ({
  focus: vi.fn(),
  isDestroyed: vi.fn(() => false),
  isMinimized: vi.fn(() => false),
  restore: vi.fn(),
})
