import { HashRouter, Route, Routes } from 'react-router-dom'
import AppLayout from '@/app/AppLayout'

const App = () => (
  <HashRouter>
    <Routes>
      <Route path="*" element={<AppLayout />} />
    </Routes>
  </HashRouter>
)

export default App
