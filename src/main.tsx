import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

// Вкладка «Город» грузится отдельным файлом. Если после новой публикации его уже нет под старым именем,
// страница один раз перезагружается сама и берёт свежую сборку.
window.addEventListener('vite:preloadError', () => {
  try {
    if (sessionStorage.getItem('reloaded-after-publish')) return
    sessionStorage.setItem('reloaded-after-publish', '1')
  } catch {
    return
  }
  location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
