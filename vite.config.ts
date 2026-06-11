import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

type AppBuildInfo = {
  version: string
  buildId: string
  commitSha: string
  builtAt: string
}

const getGitCommitSha = () => {
  try {
    return execSync('git rev-parse --short=12 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'unknown'
  }
}

const createBuildInfo = (): AppBuildInfo => {
  const builtAt = new Date().toISOString()
  const dateVersion = builtAt.slice(0, 10).replaceAll('-', '.')
  const timeVersion = builtAt.slice(11, 16).replace(':', '')
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || getGitCommitSha()
  const version = process.env.VITE_APP_VERSION || `${dateVersion}-${timeVersion}`
  return {
    version,
    buildId: `${version}-${commitSha}-${builtAt}`,
    commitSha,
    builtAt
  }
}

const buildInfo = createBuildInfo()

const buildInfoPlugin = (): Plugin => ({
  name: 'friendcast-build-info',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'build-info.json',
      source: `${JSON.stringify(buildInfo, null, 2)}\n`
    })
  },
  closeBundle() {
    // Vercel serves the Vite output directory directly; keep a concrete file in dist for preview checks too.
    writeFileSync(join(process.cwd(), 'dist', 'build-info.json'), `${JSON.stringify(buildInfo, null, 2)}\n`)
  }
})

export default defineConfig({
  plugins: [react(), buildInfoPlugin()],
  define: {
    __APP_BUILD_INFO__: JSON.stringify(buildInfo)
  }
})
