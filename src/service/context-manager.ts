import { Service, type Context } from '@deepseek-ai/cordis'
import {
  installSettingsSection,
  settingsNamespace,
  SettingsConflictError,
  type SettingsDescriptor,
  type SettingsPathOp,
  type SettingsProvider,
} from '@deepseek-ai/dsh-settings'

import { assertSafePathKey, ContextManagerError } from '../domain/errors.js'
import type { ContextManagerSnapshot, SkillMode } from '../domain/model.js'
import { normalizeSettings, parseProfileForWrite, parseSkillMode } from '../domain/normalize.js'
import {
  classifyContextManagerSchemaVersion,
  CONTEXT_MANAGER_SCHEMA_VERSION,
  CONTEXT_MANAGER_SETTINGS_SCHEMA,
  EMPTY_CONTEXT_MANAGER_SETTINGS,
  type StoredContextManagerSettings,
} from '../domain/schema.js'
import {
  assertStoredProfilePayloadSafe,
  assertStoredSettingsSectionSafe,
  isPlainObject,
} from '../domain/storage.js'

export const CONTEXT_MANAGER_SETTINGS_NAMESPACE = settingsNamespace('dsh-context-manager')

declare module '@deepseek-ai/cordis' {
  interface Context {
    dshContextManager: ContextManagerService
  }
}

interface WritableState {
  settings: SettingsProvider
  stored: StoredContextManagerSettings
  revision: number
}

/**
 * Authoritative Host-side domain service for Context Manager.
 *
 * This milestone is deliberately model-inert: it stores explicit user intent
 * and derives diagnostics, but does not mount presets, alter system prompts,
 * or shadow skills. Runtime/effective state belongs to later adapters.
 */
export class ContextManagerService extends Service {
  private readonly ownerCtx: Context
  private source: () => StoredContextManagerSettings = () => EMPTY_CONTEXT_MANAGER_SETTINGS

  constructor(ctx: Context) {
    super(ctx, 'dshContextManager')
    this.ownerCtx = ctx

    installSettingsSection(
      ctx,
      CONTEXT_MANAGER_SETTINGS_NAMESPACE,
      CONTEXT_MANAGER_SETTINGS_SCHEMA,
      EMPTY_CONTEXT_MANAGER_SETTINGS,
      {
        setSource: source => {
          this.source = source
        },
        // PR2 keeps no second state cache. Consumers derive a snapshot on read;
        // later Remote code can add an explicit change publication seam.
        onChange: () => {},
      },
    )
  }

  /**
   * Current immutable Domain view. Read-time derivation keeps DSH Settings'
   * document revision authoritative even when the raw user section changes to
   * an override whose resolved value is deep-equal and scope.watch() is silent.
   */
  snapshot(): ContextManagerSnapshot {
    const { stored, persistence } = this.readState()
    return normalizeSettings(stored, persistence)
  }

  /** List every stored profile payload, including ones the Domain cannot parse. */
  listStoredProfileIds(): readonly string[] {
    return Object.freeze(Object.keys(this.readState().stored.profiles))
  }

  /**
   * Return a detached stored payload for the advanced editor. This is the
   * resolved Context Manager profile payload, not a mutable reference into DSH
   * Settings and not the later runtime/effective view.
   */
  getStoredProfile(id: string): unknown {
    const stored = this.readState().stored
    if (!Object.hasOwn(stored.profiles, id)) {
      throw new ContextManagerError('profile-not-found', `profile ${JSON.stringify(id)} does not exist`)
    }
    return structuredClone(stored.profiles[id])
  }

  /**
   * Create a structured profile. Known Domain fields are validated, while
   * additional JSON-shaped fields are preserved verbatim for forward-compatible
   * editing instead of being silently discarded by the parser.
   */
  async createProfile(id: string, input: unknown, expectedRevision?: number): Promise<void> {
    assertSafePathKey(id, 'profile id')
    const state = this.captureWritableState(expectedRevision)
    if (Object.hasOwn(state.stored.profiles, id)) {
      throw new ContextManagerError('profile-exists', `profile ${JSON.stringify(id)} already exists`)
    }

    this.validateStructuredProfileWrite(input)
    await this.mutate(state, [{ op: 'set', path: ['profiles', id], value: input }])
  }

  /**
   * Explicitly replace any stored payload with a structurally valid profile,
   * preserving any additional JSON-shaped fields supplied by the caller.
   */
  async replaceProfile(id: string, input: unknown, expectedRevision?: number): Promise<void> {
    assertSafePathKey(id, 'profile id')
    const state = this.captureWritableState(expectedRevision)
    this.requireStoredProfile(state.stored, id)

    this.validateStructuredProfileWrite(input)
    await this.mutate(state, [{ op: 'set', path: ['profiles', id], value: input }])
  }

  /**
   * Advanced stored-payload editor seam. Domain-invalid JSON data is allowed;
   * only lossless DSH persistence constraints are enforced here.
   */
  async setRawProfile(id: string, value: unknown, expectedRevision?: number): Promise<void> {
    assertSafePathKey(id, 'profile id')
    assertStoredProfilePayloadSafe(value)
    const state = this.captureWritableState(expectedRevision)
    await this.mutate(state, [{ op: 'set', path: ['profiles', id], value }])
  }

  /**
   * Delete only the profile explicitly named. A default reference pointing at
   * it is intentionally left dangling for diagnostics until the user changes
   * that reference separately.
   */
  async deleteProfile(id: string, expectedRevision?: number): Promise<void> {
    assertSafePathKey(id, 'profile id')
    const state = this.captureWritableState(expectedRevision)
    this.requireStoredProfile(state.stored, id)
    await this.mutate(state, [{ op: 'unset', path: ['profiles', id] }])
  }

  /** Store the user's default reference literally, including unresolved ids. */
  async setDefaultProfile(id: string | undefined, expectedRevision?: number): Promise<void> {
    const state = this.captureWritableState(expectedRevision)
    await this.mutate(state, [
      id === undefined
        ? { op: 'unset', path: ['defaultProfileId'] }
        : { op: 'set', path: ['defaultProfileId'], value: id },
    ])
  }

  /**
   * Edit exactly one skill binding's `mode` leaf. Existing sibling metadata is
   * preserved for forward-compatible placement/order/activation extensions.
   * Unrelated malformed profile fields do not block this local repair/edit.
   */
  async setSkillMode(
    profileId: string,
    skillName: string,
    mode: SkillMode,
    expectedRevision?: number,
  ): Promise<void> {
    assertSafePathKey(profileId, 'profile id')
    assertSafePathKey(skillName, 'skill name')

    const state = this.captureWritableState(expectedRevision)
    const skills = this.requireSkillsObjectOrAbsent(state.stored, profileId)
    const binding = skills?.[skillName]
    if (binding !== undefined && !isPlainObject(binding)) {
      throw new ContextManagerError(
        'profile-path-not-editable',
        `profile ${JSON.stringify(profileId)} skill ${JSON.stringify(skillName)} is not an object; replace or remove that binding explicitly`,
      )
    }

    let parsedMode: SkillMode
    try {
      parsedMode = parseSkillMode(mode)
    } catch (error) {
      throw new ContextManagerError(
        'invalid-skill-mode',
        error instanceof Error ? error.message : String(error),
      )
    }

    await this.mutate(state, [{
      op: 'set',
      path: ['profiles', profileId, 'skills', skillName, 'mode'],
      value: parsedMode,
    }])
  }

  /**
   * Explicitly remove one complete skill binding, including any unknown future
   * sibling metadata. This is intentionally separate from changing `mode`.
   */
  async removeSkillBinding(
    profileId: string,
    skillName: string,
    expectedRevision?: number,
  ): Promise<void> {
    assertSafePathKey(profileId, 'profile id')
    assertSafePathKey(skillName, 'skill name')

    const state = this.captureWritableState(expectedRevision)
    const skills = this.requireSkillsObjectOrAbsent(state.stored, profileId)
    if (skills === undefined || !Object.hasOwn(skills, skillName)) {
      throw new ContextManagerError(
        'skill-binding-not-found',
        `profile ${JSON.stringify(profileId)} has no stored skill binding ${JSON.stringify(skillName)}`,
      )
    }

    await this.mutate(state, [{
      op: 'unset',
      path: ['profiles', profileId, 'skills', skillName],
    }])
  }

  private validateStructuredProfileWrite(input: unknown): void {
    try {
      parseProfileForWrite(input)
    } catch (error) {
      throw new ContextManagerError(
        'invalid-profile',
        error instanceof Error ? error.message : String(error),
      )
    }

    // The parser intentionally ignores unknown extension fields. Validate the
    // complete supplied payload for editor losslessness before storing that
    // original payload, so successful structured writes never drop them.
    assertStoredProfilePayloadSafe(input)
  }

  private requireStoredProfile(stored: StoredContextManagerSettings, id: string): unknown {
    if (!Object.hasOwn(stored.profiles, id)) {
      throw new ContextManagerError('profile-not-found', `profile ${JSON.stringify(id)} does not exist`)
    }
    return stored.profiles[id]
  }

  private requireProfileObject(
    stored: StoredContextManagerSettings,
    id: string,
  ): Record<string, unknown> {
    const profile = this.requireStoredProfile(stored, id)
    if (!isPlainObject(profile)) {
      throw new ContextManagerError(
        'profile-path-not-editable',
        `profile ${JSON.stringify(id)} is not an object; use the stored-payload editor or replace it explicitly`,
      )
    }
    return profile
  }

  private requireSkillsObjectOrAbsent(
    stored: StoredContextManagerSettings,
    profileId: string,
  ): Record<string, unknown> | undefined {
    const profile = this.requireProfileObject(stored, profileId)
    if (profile.skills === undefined) return undefined
    if (!isPlainObject(profile.skills)) {
      throw new ContextManagerError(
        'profile-path-not-editable',
        `profile ${JSON.stringify(profileId)} has a non-object skills field; use the stored-payload editor or replace the profile explicitly`,
      )
    }
    return profile.skills
  }

  /**
   * DSH keeps the last good resolved value after a schema-invalid external
   * edit. For a still-object raw user section, `describe().user` exposes that
   * invalid document even though `value` remains last-good. Refuse semantic
   * writes in that state so an edit cannot be based on stale resolved data and
   * accidentally repair/overwrite unrelated raw fields.
   *
   * A non-object raw namespace is reported by DSH as `user === undefined` and
   * cannot be distinguished from an absent section through the public
   * descriptor. Native `settings.mutate()` still rejects that state at its
   * `section()` boundary before persistence, so it remains lossless.
   */
  private assertCurrentUserDocumentWritable(descriptor: SettingsDescriptor): void {
    if (descriptor.user === undefined) return
    try {
      CONTEXT_MANAGER_SETTINGS_SCHEMA(descriptor.user as never)
      assertStoredSettingsSectionSafe(descriptor.user)
    } catch (error) {
      throw new ContextManagerError(
        'persistence-document-invalid',
        `the current stored Context Manager settings section is invalid or cannot be preserved losslessly; edit or restore that document explicitly before applying semantic mutations (${error instanceof Error ? error.message : String(error)})`,
      )
    }
  }

  private readState(): {
    stored: StoredContextManagerSettings
    persistence: ContextManagerSnapshot['persistence']
  } {
    const settings = this.ownerCtx.get('settings')
    if (settings === undefined) {
      return {
        stored: this.source(),
        persistence: Object.freeze({
          available: false,
          registered: false,
          writable: false,
        }),
      }
    }

    // Host-internal authoritative reads use the verbatim descriptor. Redaction
    // is for wire/UI surfaces; consuming a redacted value here would make a
    // future secret-bearing field alter the service's own Domain state.
    const descriptor = settings
      .describe()
      .find(item => item.ns === CONTEXT_MANAGER_SETTINGS_NAMESPACE)

    if (descriptor === undefined) {
      return {
        stored: this.source(),
        persistence: Object.freeze({
          available: true,
          registered: false,
          writable: false,
        }),
      }
    }

    return {
      stored: descriptor.value as StoredContextManagerSettings,
      persistence: Object.freeze({
        available: true,
        registered: true,
        writable: settings.writable,
        revision: descriptor.revision,
      }),
    }
  }

  /**
   * Capture one write basis without awaiting: Domain/path validation and the
   * eventual Settings mutation are fenced to this exact raw-section revision.
   * If another valid writer lands first, native SettingsConflictError wins.
   * Schema-invalid external edits are checked separately against descriptor.user
   * because DSH intentionally keeps the last-good resolved value for them.
   */
  private captureWritableState(expectedRevision?: number): WritableState {
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

    const descriptor = settings
      .describe()
      .find(item => item.ns === CONTEXT_MANAGER_SETTINGS_NAMESPACE)
    if (descriptor === undefined) {
      throw new ContextManagerError(
        'persistence-not-ready',
        'Context Manager settings namespace is not registered yet',
      )
    }

    if (expectedRevision !== undefined && expectedRevision !== descriptor.revision) {
      throw new SettingsConflictError(
        CONTEXT_MANAGER_SETTINGS_NAMESPACE,
        expectedRevision,
        descriptor.revision,
      )
    }

    this.assertCurrentUserDocumentWritable(descriptor)

    const stored = descriptor.value as StoredContextManagerSettings
    const versionStatus = classifyContextManagerSchemaVersion(stored.schemaVersion)
    if (versionStatus !== 'supported') {
      throw new ContextManagerError(
        versionStatus === 'invalid' ? 'invalid-schema-version' : 'unsupported-schema-version',
        versionStatus === 'invalid'
          ? `settings schema version ${String(stored.schemaVersion)} is invalid; this build only writes schema ${String(CONTEXT_MANAGER_SCHEMA_VERSION)}`
          : `settings schema version ${String(stored.schemaVersion)} is unsupported; this build only writes schema ${String(CONTEXT_MANAGER_SCHEMA_VERSION)}`,
      )
    }

    return {
      settings,
      stored,
      // The caller may omit expectedRevision for same-process convenience, but
      // the write is still fenced to the revision whose data we just checked.
      revision: descriptor.revision,
    }
  }

  private async mutate(state: WritableState, ops: readonly SettingsPathOp[]): Promise<void> {
    await state.settings.mutate(
      CONTEXT_MANAGER_SETTINGS_NAMESPACE,
      ops,
      state.revision,
    )
  }
}
