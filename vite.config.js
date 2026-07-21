import { defineConfig, loadEnv } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  const API_URL = env.VITE_API_URL

  return {
    plugins: [svelte()],
    server: {
      proxy: {
        '/api': {
          target: API_URL,
          changeOrigin: true,
          secure: false
        },
        '/uploads': {
          target: API_URL,
          changeOrigin: true,
          secure: false
        }
      }
    }
  }
})