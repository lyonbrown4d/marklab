import { request } from '@/runtime/tauri/transport'

export type GitCredentials = { url: string; username: string; token: string }
export const gitCredentialsApi = {
  available: () => typeof window !== 'undefined' && window.marklabTauri !== undefined,
  save: (credentials: GitCredentials) =>
    request<{ ok: boolean }>('git_credentials_save', credentials),
  remove: (url: string) => request<{ ok: boolean }>('git_credentials_remove', { url }),
}
