import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { allPagesViewModes, type AllPagesViewMode } from '@/logic/allPagesViews'

type AllPagesViewModeSelectProps = {
  onValueChange: (value: AllPagesViewMode) => void
  t: (key: string) => string
  value: AllPagesViewMode
}

export const AllPagesViewModeSelect = ({
  onValueChange,
  t,
  value,
}: AllPagesViewModeSelectProps) => (
  <Select value={value} onValueChange={(nextValue) => onValueChange(nextValue as AllPagesViewMode)}>
    <SelectTrigger aria-label={t('allPages.viewMode')}>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectGroup>
        {allPagesViewModes.map((mode) => (
          <SelectItem key={mode} value={mode}>
            {t(`allPages.view.${mode}`)}
          </SelectItem>
        ))}
      </SelectGroup>
    </SelectContent>
  </Select>
)
