import { defineConfig } from 'vitest/config'
export default defineConfig({
  base: process.env.PAGES_BASE || '/',
  server: { host: '127.0.0.1' },
  build: { target: 'es2022' },
  test: { include: ['tests/**/*.test.ts'] },
})
