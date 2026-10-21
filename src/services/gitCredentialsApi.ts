import { invoke } from '@/runtime/ipc'
import type { DesktopCommandArgs } from '@/generated/desktop/bindings'

export type GitCredentials = DesktopCommandArgs['git_credentials_save']['request']
export const gitCredentialsApi = {
  available: () => typeof window !== 'undefined' && window.marklabTauri !== undefined,
  save: (credentials: GitCredentials) => invoke('git_credentials_save', credentials),
  remove: (url: string) => invoke('git_credentials_remove', { url }),
}
