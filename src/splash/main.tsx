import { createRoot } from 'react-dom/client'
import '@/splash/splash.scss'
import { SplashScreen } from '@/splash/SplashScreen'

const root = document.getElementById('splash-root')

if (!root) throw new Error('Splash root element is missing.')

createRoot(root).render(<SplashScreen />)
