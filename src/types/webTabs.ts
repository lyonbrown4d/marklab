import { z } from 'zod'

const webTabIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/)
const coordinateSchema = z.number().int().finite()
const dimensionSchema = z.number().int().finite().positive()

export const webTabBoundsSchema = z.object({
  height: dimensionSchema,
  width: dimensionSchema,
  x: coordinateSchema,
  y: coordinateSchema,
})

export const webTabActivateRequestSchema = z.object({
  bounds: webTabBoundsSchema,
  tabId: webTabIdSchema,
  url: z.string().min(1).max(4096),
})

export const webTabSetBoundsRequestSchema = z.object({
  bounds: webTabBoundsSchema,
  tabId: webTabIdSchema,
})

export const webTabIdRequestSchema = z.object({ tabId: webTabIdSchema })

export const webTabNavigateRequestSchema = z.object({
  tabId: webTabIdSchema,
  url: z.string().min(1).max(4096),
})

export const webTabActionResultSchema = z.object({ ok: z.literal(true) })

export const webTabShortcutActionSchema = z.enum([
  'app.commandPalette',
  'app.settings',
  'file.new',
  'file.openProject',
  'file.openFile',
  'tab.next',
  'tab.previous',
  'tab.close',
  'view.wysiwyg',
  'view.source',
  'view.toggleSource',
  'view.toggleSidebar',
  'view.toggleRightSidebar',
  'view.toggleTerminal',
  'view.toggleReadonly',
  'view.toggleStatusBar',
])

export const webTabShortcutBindingsRequestSchema = z.object({
  bindings: z.partialRecord(webTabShortcutActionSchema, z.array(z.string().min(1).max(64)).max(4)),
})

export const webTabStateSchema = z.object({
  active: z.boolean(),
  canGoBack: z.boolean(),
  canGoForward: z.boolean(),
  error: z
    .object({
      code: z.number().int().optional(),
      description: z.string().max(1024),
    })
    .optional(),
  status: z.enum(['idle', 'loading', 'ready', 'error', 'crashed', 'closed']),
  tabId: webTabIdSchema,
  title: z.string().max(512),
  url: z.string().max(4096),
})

export const webTabEventSchema = z.discriminatedUnion('type', [
  z.object({ state: webTabStateSchema, type: z.literal('state') }),
  z.object({
    tabId: webTabIdSchema,
    type: z.literal('open-requested'),
    url: z.string(),
  }),
  z.object({
    action: webTabShortcutActionSchema,
    tabId: webTabIdSchema,
    type: z.literal('shortcut'),
  }),
])

export type WebTabActionResult = z.infer<typeof webTabActionResultSchema>
export type WebTabActivateRequest = z.infer<typeof webTabActivateRequestSchema>
export type WebTabBounds = z.infer<typeof webTabBoundsSchema>
export type WebTabEvent = z.infer<typeof webTabEventSchema>
export type WebTabIdRequest = z.infer<typeof webTabIdRequestSchema>
export type WebTabNavigateRequest = z.infer<typeof webTabNavigateRequestSchema>
export type WebTabSetBoundsRequest = z.infer<typeof webTabSetBoundsRequestSchema>
export type WebTabShortcutAction = z.infer<typeof webTabShortcutActionSchema>
export type WebTabShortcutBindingsRequest = z.infer<typeof webTabShortcutBindingsRequestSchema>
export type WebTabState = z.infer<typeof webTabStateSchema>

export type WebTabsApi = {
  activate: (request: WebTabActivateRequest) => Promise<WebTabActionResult>
  close: (request: WebTabIdRequest) => Promise<WebTabActionResult>
  goBack: (request: WebTabIdRequest) => Promise<WebTabActionResult>
  goForward: (request: WebTabIdRequest) => Promise<WebTabActionResult>
  hide: (request: WebTabIdRequest) => Promise<WebTabActionResult>
  navigate: (request: WebTabNavigateRequest) => Promise<WebTabActionResult>
  onState: (handler: (event: WebTabEvent) => void) => () => void
  reload: (request: WebTabIdRequest) => Promise<WebTabActionResult>
  setBounds: (request: WebTabSetBoundsRequest) => Promise<WebTabActionResult>
  setShortcutBindings: (request: WebTabShortcutBindingsRequest) => Promise<WebTabActionResult>
  stop: (request: WebTabIdRequest) => Promise<WebTabActionResult>
}
