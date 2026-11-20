import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' — сайт работает из любой подпапки GitHub Pages без настройки.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: {
    rolldownOptions: {
      output: {
        // three.js лежит отдельным файлом: он не меняется от правок сцены,
        // и после публикации браузер берёт его из кэша, а не качает 700 КБ заново.
        codeSplitting: {
          groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }],
        },
      },
    },
  },
})
