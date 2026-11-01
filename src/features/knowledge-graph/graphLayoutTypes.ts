export const graphLayoutKinds = ['forceatlas2', 'circular', 'grouped'] as const

export type GraphLayoutKind = (typeof graphLayoutKinds)[number]
