import { create } from 'zustand'
import {
  EMPTY_STATUS_CENTER_SUMMARY,
  type StatusCenterSummary,
} from '@/components/status-center/statusCenterModel'

type StatusCenterSummaryState = StatusCenterSummary & {
  setSummary: (summary: StatusCenterSummary) => void
}

export const useStatusCenterSummaryStore = create<StatusCenterSummaryState>()((set) => ({
  ...EMPTY_STATUS_CENTER_SUMMARY,
  setSummary: (summary) => set(summary),
}))
