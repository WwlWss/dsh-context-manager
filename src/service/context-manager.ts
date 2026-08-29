import { Service, type Context } from '@deepseek-ai/cordis'
import {
  installSettingsSection,
  settingsNamespace,
  type SettingsProvider,
  type SettingsPathOp,
} from '@deepseek-ai/dsh-settings'

import { assertSafePathKey, ContextManagerError } from '../domain/errors.js'
import type { ContextManagerSnapshot, ContextProfile, SkillMode } from '../domain/model.js'
import { normalizeSettings, parseProfileForWrite } from '../domain/normalize.js'
import {
  CONTEXT_MANAGER_SCHEMA_VERSION,
  CONTEXT_MANAGER_SETTINGS_SCHEMA,
  EMPTY_CONTEXT_MANAGER_SETTINGS,
  type StoredContextManagerSettings,
} from '../domain/schema.js'

export const CONTEXT_MANAGER_SETTINGS_NAMESPACE = settingsNamespace('dsh-context-manager')

declare module '@deepseek-ai/cordis' {
  interface Context {
    dshContextManager: ContextManagerService
  }
}

/**
 * Authoritative Host-side state for Context Manager.
 *
 * This service is deliberately model-inert: it stores user intent and exposes
 * diagnostics, but it does not mount presets, alter system prompts, or shadow
 * skills. Runtime adapters are separate milestones.
 */
export class ContextManagerService extends Service {
  private readonly ownerCtx: Context
  private source: () => StoredContextManagerSettings = () => EMPTY_CONTEXT_MANAGER_SETTINGS
  private current: ContextManagerSnapshot

  constructor(ctx: Context) {
    super(ctx, 'dshContextManager')
    this.ownerCtx = ctx
    this.current = normalizeSettings(EMPTY_CONTEXT_MANAGER_SETTINGS, {
      available: false,
      writable: false,
    })

    installSettingsSection(
      ctx,
      CONTEXT_MANAGER_SETTINGS_NAMESPACE,
      CONTEXT_MANAGER_SETTINGS_SCHEMA,
      EMPTY_CONTEXT_MANAGER_SETTINGS,
      {
        setSource: source => {
          this.source = source
          this.refresh()
        },
        onChange: () => {
          this.refresh()
        },
      },
    )
  }

  /** Current immutable domain view. */
  snapshot(): ContextManagerSnapshot {
    return this.current
  }

  /**
   * Create a normal profile. This validates only the profile's own storage
   * shape; it does not require referenced presets or skills to exist.
   */
  async createProfile(id: string, input: unknown, expectedRevision?: number): Promise<void> {
    assertSafePathKey(id, 'profile id')
    const stored = this.source()
    if (Object.hasOwn(stored.profiles, id)) {
      throw new ContextManagerError('profile-exists', `profile ${JSON.stringify(id)} already exists`)
    }
    const profile = this.parseWritableProfile(input)
    await this.mutate([{ op: 'set', path: ['profiles', id], value: profile }], expectedRevision)
  }

  /** Explicitly replace a profile with a normal, domain-usable value. */
  async replaceProfile(id: string, input: unknown, expectedRevision?: number): Promise<void> {
    assertSafePathKey(id, 'profile id')
    this.requireStoredProfile(id)
    const profile = this.parseWritableProfile(input)
    await this.mutate([{ op: 'set', path: ['profiles', id], value: profile }], expectedRevision)
  }

  /**
   * Advanced/raw editor seam. The value is stored exactly as supplied after
   * DSH Settings' JSON-integrity checks. Invalid domain content is preserved
   * and appears as diagnostics instead of being auto-repaired.
   */
  async setRawProfile(id: string, value: unknown, expectedRevision?: number): Promise<void> {
    assertSafePathKey(id, 'profile id')
    await this.mutate([{ op: 'set', path: ['profiles', id], value }], expectedRevision)
  }

  /**
   * Delete only the profile the caller named. A default reference pointing at
   * it is deliberately left dangling and becomes a diagnostic until the user
   * explicitly changes that reference.
   */
  async deleteProfile(id: string, expectedRevision?: number): Promise<void> {
    assertSafePathKey(id, 'profile id')
    this.requireStoredProfile(id)
    await this.mutate([{ op: 'unset', path: ['profiles', id] }], expectedRevision)
  }

  /**
   * Store the user's default reference literally. It may intentionally point
   * at a missing or currently malformed profile; that state is diagnostic,
   * not grounds for silent fallback.
   */
  async setDefaultProfile(id: string | undefined, expectedRevision?: number): Promise<void> {
    if (id !== undefined) assertSafePathKey(id, 'default profile id')
    await this.mutate([
      id === undefined
        ? { op: 'unset', path: ['defaultProfileId'] }
        : { op: 'set', path: ['defaultProfileId'], value: id },
    ], expectedRevision)
  }

  /**
   * Edit one skill policy without restating the rest of the profile. The skill
   * does not have to exist in the native DSH registry yet.
   */
  async setSkillMode(
    profileId: string,
    skillName: string,
    mode: SkillMode | undefined,
    expectedRevision?: number,
  ): Promise<void> {
    assertSafePathKey(profileId, 'profile id')
    assertSafePathKey(skillName, 'skill name')
    this.requireStoredProfile(profileId)

    await this.mutate([
      mode === undefined
        ? { op: 'unset', path: ['profiles', profileId, 'skills', skillName] }
        : { op: 'set', path: ['profiles', profileId, 'skills', skillName], value: mode },
    ], expectedRevision)
  }

  private parseWritableProfile(input: unknown): ContextProfile {
    try {
      return parseProfileForWrite(input)
    } catch (error) {
      throw new ContextManagerError(
        'invalid-profile',
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  private requireStoredProfile(id: string): void {
    if (!Object.hasOwn(this.source().profiles, id)) {
      throw new ContextManagerError('profile-not-found', `profile ${JSON.stringify(id)} does not exist`)
    }
  }

  private settingsForWrite(): SettingsProvider {
    const settings = this.ownerCtx.get('settings')
    if (settings === undefined) {
      throw new ContextManagerError(
        'persistence-unavailable',
        'Context Manager settings persistence is unavailable',
      )
    }
    if (!settings.writable) {
      throw new ContextManagerError(
        'persistence-read-only',
        'Context Manager settings provider is read-only',
      )
    }
    if (this.source().schemaVersion > CONTEXT_MANAGER_SCHEMA_VERSION) {
      throw new ContextManagerError(
        'unsupported-schema-version',
        `settings schema ${String(this.source().schemaVersion)} is newer than supported schema ${String(CONTEXT_MANAGER_SCHEMA_VERSION)}`,
      )
    }
    return settings
  }

  private async mutate(ops: readonly SettingsPathOp[], expectedRevision?: number): Promise<void> {
    const settings = this.settingsForWrite()
    await settings.mutate(CONTEXT_MANAGER_SETTINGS_NAMESPACE, ops, expectedRevision)
    // Settings commits its resolved value before watcher callbacks run. Refresh
    // synchronously after the awaited write so callers never observe a stale
    // service snapshot while the watcher queue catches up.
    this.refresh()
  }

  private refresh(): void {
    const settings = this.ownerCtx.get('settings')
    const descriptor = settings
      ?.describe({ redactSecrets: true })
      .find(item => item.ns === CONTEXT_MANAGER_SETTINGS_NAMESPACE)

    this.current = normalizeSettings(this.source(), {
      available: settings !== undefined,
      writable: settings?.writable === true,
      ...(descriptor === undefined ? {} : { revision: descriptor.revision }),
    })
  }
}
