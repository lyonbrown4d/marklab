import FileSettingsPage from '@/components/settings/FileSettingsPage'
import SavingSettingsPage from '@/components/settings/SavingSettingsPage'

const FileAndSavingSettingsPage = () => (
  <div className="flex flex-col gap-8">
    <FileSettingsPage />
    <SavingSettingsPage />
  </div>
)

export default FileAndSavingSettingsPage
