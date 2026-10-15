export const localPath = (base: string, pathname = '') =>
  `${base.replace(/\/$/, '')}/${pathname.replace(/^\//, '')}`
