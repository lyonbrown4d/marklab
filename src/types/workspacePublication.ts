import type { DesktopCommandArgs, DesktopCommandResults } from '@/generated/desktop/bindings'

export type WorkspacePublicationRequest =
  DesktopCommandArgs['export_workspace_publication']['request']
export type WorkspacePublicationOptions = WorkspacePublicationRequest['options']
export type WorkspacePublicationFormat = WorkspacePublicationOptions['format']
export type WorkspacePublicationPageSize = WorkspacePublicationOptions['pageSize']
export type WorkspacePublicationOrientation = WorkspacePublicationOptions['orientation']
export type WorkspacePublicationMargin = WorkspacePublicationOptions['margin']
export type WorkspacePublicationLocale = WorkspacePublicationOptions['locale']
export type WorkspacePublicationPlan = DesktopCommandResults['fs_get_workspace_publication_plan']
export type WorkspacePublicationChapter = WorkspacePublicationPlan['chapters'][number]
