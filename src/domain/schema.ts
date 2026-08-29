import z from '@deepseek-ai/schemastery'

export const CONTEXT_MANAGER_SCHEMA_VERSION = 1
export const SUPPORTED_CONTEXT_MANAGER_SCHEMA_VERSIONS = Object.freeze([1] as const)

export type RawProfilePayload = unknown
export type SchemaVersionStatus = 'supported' | 'invalid' | 'unsupported'

export function classifyContextManagerSchemaVersion(version: number): SchemaVersionStatus {
  if (!Number.isInteger(version) || version < 1) return 'invalid'
  return (SUPPORTED_CONTEXT_MANAGER_SCHEMA_VERSIONS as readonly number[]).includes(version)
    ? 'supported'
    : 'unsupported'
}

/**
 * Persistence envelope owned by ctx.settings.
 *
 * Keep the envelope itself structurally valid while leaving each profile
 * payload opaque. Strictly validating the whole profile dictionary at Settings
 * registration time would let one malformed advanced-editor payload take the
 * entire Context Manager namespace offline before domain diagnostics can run.
 */
export interface StoredContextManagerSettings {
  schemaVersion: number
  defaultProfileId?: string
  profiles: Record<string, RawProfilePayload>
}

export const CONTEXT_MANAGER_SETTINGS_SCHEMA: z<StoredContextManagerSettings> = z.object({
  // Intentionally broad at the Settings layer. Unsupported/invalid numeric
  // versions remain readable so the domain can surface a read-only diagnostic
  // instead of making initial namespace registration fail.
  schemaVersion: z.number().default(CONTEXT_MANAGER_SCHEMA_VERSION),
  defaultProfileId: z.string(),
  profiles: z.dict(z.any()).default({}),
})

export const EMPTY_CONTEXT_MANAGER_SETTINGS: StoredContextManagerSettings = {
  schemaVersion: CONTEXT_MANAGER_SCHEMA_VERSION,
  profiles: {},
}
