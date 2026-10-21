import type {
  DesktopCommandArgs,
  DesktopCommandResults,
  DesktopEventPayloads,
} from '@/generated/desktop/bindings'
import { z } from 'zod'

const webTabIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/)
const coordinateSchema = z.number().int()
const dimensionSchema = z.number().int().positive()

export const webTabBoundsSchema = z.object({
  height: dimensionSchema,
  width: dimensionSchema,
  x: coordinateSchema,
  y: coordinateSchema,
}) satisfies z.ZodType<WebTabBounds>

export const webTabActivateRequestSchema = z.object({
  bounds: webTabBoundsSchema,
  tabId: webTabIdSchema,
  url: z.string().min(1).max(4096),
}) satisfies z.ZodType<WebTabActivateRequest>

export const webTabSetBoundsRequestSchema = z.object({
  bounds: webTabBoundsSchema,
  tabId: webTabIdSchema,
}) satisfies z.ZodType<WebTabSetBoundsRequest>

export const webTabIdRequestSchema = z.object({
  tabId: webTabIdSchema,
}) satisfies z.ZodType<WebTabIdRequest>

export const webTabNavigateRequestSchema = z.object({
  tabId: webTabIdSchema,
  url: z.string().min(1).max(4096),
}) satisfies z.ZodType<WebTabNavigateRequest>

export const webTabActionResultSchema = z.object({
  ok: z.literal(true),
}) satisfies z.ZodType<WebTabActionResult>

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
]) satisfies z.ZodType<WebTabShortcutAction>

export const webTabShortcutBindingsRequestSchema = z.object({
  bindings: z.partialRecord(webTabShortcutActionSchema, z.array(z.string().min(1).max(64)).max(4)),
}) satisfies z.ZodType<WebTabShortcutBindingsRequest>

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
}) satisfies z.ZodType<WebTabState>

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
]) satisfies z.ZodType<WebTabEvent>

export type WebTabActionResult = DesktopCommandResults['web_tabs_activate']

export type WebTabActivateRequest = DesktopCommandArgs['web_tabs_activate']['request']

export type WebTabBounds = DesktopCommandArgs['web_tabs_activate']['request']['bounds']

export type WebTabEvent = DesktopEventPayloads['web-tabs-state']

export type WebTabIdRequest = DesktopCommandArgs['web_tabs_close']['request']

export type WebTabNavigateRequest = DesktopCommandArgs['web_tabs_navigate']['request']

export type WebTabSetBoundsRequest = DesktopCommandArgs['web_tabs_set_bounds']['request']

export type WebTabShortcutAction = Extract<WebTabEvent, { type: 'shortcut' }>['action']

export type WebTabShortcutBindingsRequest =
  DesktopCommandArgs['web_tabs_set_shortcut_bindings']['request']

export type WebTabState = Extract<WebTabEvent, { type: 'state' }>['state']

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
