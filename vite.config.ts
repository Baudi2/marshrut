import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' — сайт работает из любой подпапки GitHub Pages без настройки.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173, strictPort: true },
})
