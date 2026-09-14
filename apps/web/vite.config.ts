import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5273 },
  build: {
    rollupOptions: {
      output: {
        // The chain libraries change far less often than the app, so they get
        // chunks of their own and stay cached across deploys of the app code.
        manualChunks(id) {
          if (id.includes('node_modules/@ckb-ccc') || id.includes('node_modules/ethers')) return 'ckb'
          if (id.includes('node_modules/@noble') || id.includes('node_modules/@scure')) return 'crypto'
          if (id.includes('node_modules/react')) return 'react'
          return undefined
        },
      },
    },
  },
})
