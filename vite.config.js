import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const build = String(Date.now())

// สร้างไฟล์ version.json ไว้ให้แอปเช็กว่ามีเวอร์ชันใหม่ไหม
const versionFile = {
  name: 'ow-version-file',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({ version: pkg.version, build }),
    })
  },
}

export default defineConfig({
  plugins: [react(), versionFile],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(build),
  },
})
