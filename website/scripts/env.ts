// Tokens are read only by the build-time sync script and are never imported into page code.
export const releaseEnvironment = {
  githubToken: process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim(),
}
