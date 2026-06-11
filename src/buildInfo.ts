export type AppBuildInfo = {
  version: string
  buildId: string
  commitSha: string
  builtAt: string
}

export const appBuildInfo: AppBuildInfo = __APP_BUILD_INFO__
