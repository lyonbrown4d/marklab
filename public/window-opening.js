const stage = document.querySelector('[data-opening-stage]')
const workspacePath = document.querySelector('[data-workspace-path]')
const retry = document.querySelector('[data-retry]')
const isChinese = navigator.language.toLowerCase().startsWith('zh')
const labels = isChinese
  ? {
      starting: '正在启动窗口…',
      loading: '正在加载工作区…',
      indexing: '正在准备索引…',
      failed: '工作区打开失败',
      retry: '重试',
    }
  : {
      starting: 'Starting window…',
      loading: 'Loading workspace…',
      indexing: 'Preparing index…',
      failed: 'Workspace failed to open',
      retry: 'Retry',
    }

retry.textContent = labels.retry

window.marklabElectron.window.onCloseRequested(() => {})

window.marklabElectron.opening.onProgress((progress) => {
  stage.textContent = progress.error || labels[progress.stage]
  workspacePath.textContent = progress.workspacePath
  workspacePath.title = progress.workspacePath
  retry.hidden = progress.stage !== 'failed'
})

retry.addEventListener('click', async () => {
  retry.disabled = true
  stage.textContent = labels.starting
  const result = await window.marklabElectron.opening.retry()
  if (!result.ok) {
    stage.textContent = result.error || labels.failed
    retry.disabled = false
    retry.hidden = false
  }
})
