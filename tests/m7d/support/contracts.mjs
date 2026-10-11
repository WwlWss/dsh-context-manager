import assert from 'node:assert/strict'

/** The Client support matrix is narrower than the Host/SlotCore matrix. */
export const RETAINED_CLIENT_VERSIONS = Object.freeze([
  '0.1.2-rc.1', '0.1.5-rc.1', '0.1.5-rc.2', '0.1.6-alpha.2',
])
export const PLAYWRIGHT_VERSION = '1.56.1'

export function qualifyVersion(version) {
  assert.ok(RETAINED_CLIENT_VERSIONS.includes(version),
    'M7D is not a compatibility-intake test: unsupported DSH version ' + String(version))
  return version
}

/** A base-only "dsh plugin" profile cannot boot Web: clone shipped web first. */
export function initializeWebProfileArgs(version, profile) {
  qualifyVersion(version)
  assert.match(profile, /^[a-z0-9][a-z0-9-]*$/)
  return ['dlx', '@deepseek-ai/dsh@' + version,
    '--profile', profile, '--from-default-profile', 'web', '--dump-config']
}

export function installArgs(version, profile, tarball) {
  qualifyVersion(version)
  assert.match(profile, /^[a-z0-9][a-z0-9-]*$/)
  assert.ok(typeof tarball === 'string' && tarball.endsWith('.tgz'))
  return ['dlx', '@deepseek-ai/dsh@' + version,
    'plugin', '--profile', profile, 'add', tarball]
}

export function webArgs(version, profile) {
  qualifyVersion(version)
  assert.match(profile, /^[a-z0-9][a-z0-9-]*$/)
  return ['dlx', '@deepseek-ai/dsh@' + version,
    '--profile', profile, 'web', '--no-open',
    '--host', '127.0.0.1', '--port', '0']
}

export function stripAnsi(value) {
  return String(value).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
}

/** Match the published dsh web readiness line, never an arbitrary log URL. */
export function parseWebUrl(output) {
  const normalized = stripAnsi(output)
  const match = normalized.match(/\bdsh web:\s*(https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+(?:\/[^\s)]*)?)/i)
  if (!match) return undefined
  const address = new URL(match[1])
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(address.hostname))
  if (!(Number(address.port) > 0)) return undefined
  return address.toString()
}

/** Never put a live Web authentication URL or bearer secret in CI artifacts. */
export function redactDiagnostic(value) {
  return stripAnsi(value)
    .replace(/([?&]token=)[^&#\s)]+/gi, '$1[REDACTED]')
    .replace(/(Authorization:\s*Bearer\s+)[^\s]+/gi, '$1[REDACTED]')
    .replace(/(Bearer\s+)[a-z0-9._~+/-]{12,}/gi, '$1[REDACTED]')
    .replace(/(DSH_[A-Z_]*(?:KEY|TOKEN|SECRET)\s*=\s*)[^\s]+/gi, '$1[REDACTED]')
}

export function assertArtifactDigest(value) {
  assert.match(value, /^[a-f0-9]{64}$/, 'expected tarball SHA-256')
}

