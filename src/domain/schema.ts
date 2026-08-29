import z from '@deepseek-ai/schemastery'

export const CONTEXT_MANAGER_SCHEMA_VERSION = 1

/**
 * Persistence envelope owned by ctx.settings.
 *
 * Profile payloads stay intentionally opaque here. Strictly validating the
 * whole dictionary at registration time would let one malformed profile take
 * the entire Context Manager namespace offline. Domain parsing validates each
 * profile independently instead.
 */
export interface StoredContextManagerSettings {
  schemaVersion: number
  defaultProfileId?: string
  profiles: Record<string, unknown>
}

export const CONTEXT_MANAGER_SETTINGS_SCHEMA: z<StoredContextManagerSettings> = z.object({
  schemaVersion: z.number().default(CONTEXT_MANAGER_SCHEMA_VERSION),
  defaultProfileId: z.string(),
  profiles: z.dict(z.any()).default({}),
})

export const EMPTY_CONTEXT_MANAGER_SETTINGS: StoredContextManagerSettings = {
  schemaVersion: CONTEXT_MANAGER_SCHEMA_VERSION,
  profiles: {},
}
