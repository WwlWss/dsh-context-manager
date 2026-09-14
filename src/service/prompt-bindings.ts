import { Service, type Context } from '@deepseek-ai/cordis'
import {
  SettingsConflictError,
  type SettingsDescriptor,
  type SettingsPathOp,
  type SettingsProvider,
} from '../adapters/settings.js'
import { assertSafePathKey, ContextManagerError } from '../domain/errors.js'
import type { PromptBindingInput, PromptPlacement } from '../domain/model.js'
import {
  parsePromptBinding,
  parsePromptOrder,
  parsePromptPlacement,
} from '../domain/normalize.js'
import {
  classifyContextManagerSchemaVersion,
  CONTEXT_MANAGER_SCHEMA_VERSION,
  CONTEXT_MANAGER_SETTINGS_SCHEMA,
  type StoredContextManagerSettings,
} from '../domain/schema.js'
import { assertStoredProfilePayloadSafe, isPlainObject } from '../domain/storage.js'
import { CONTEXT_MANAGER_SETTINGS_NAMESPACE } from './context-manager.js'

interface WritableState {
  settings: SettingsProvider
  stored: StoredContextManagerSettings
  revision: number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    dshContextPromptBindings: ContextManagerPromptBindings
  }
}

/**
 * Model-inert authoring service for Profile -> PromptResource bindings.
 * It writes only the explicitly requested Settings path and never resolves,
 * repairs, deletes, or applies the referenced PromptResource.
 */
export class ContextManagerPromptBindings extends Service {
  private readonly ownerCtx: Context

  constructor(ctx: Context) {
    super(ctx, 'dshContextPromptBindings')
    this.ownerCtx = ctx
  }

  async add(
    profileId: string,
    resourceId: string,
    input: PromptBindingInput,
    expectedRevision?: number,
  ): Promise<void> {
    assertSafePathKey(profileId, 'profile id')
    assertSafePathKey(resourceId, 'prompt resource id')
    const state = this.captureWritableState(expectedRevision)
    const prompts = this.requirePromptsObjectOrAbsent(state.stored, profileId)
    if (prompts !== undefined && Object.hasOwn(prompts, resourceId)) {
      throw new ContextManagerError(
        'prompt-binding-exists',
        `profile ${JSON.stringify(profileId)} already has prompt binding ${JSON.stringify(resourceId)}`,
      )
    }
    this.validateBindingInput(input)
    await this.mutate(state, [{
      op: 'set',
      path: ['profiles', profileId, 'prompts', resourceId],
      value: input,
    }])
  }

  async setEnabled(
    profileId: string,
    resourceId: string,
    enabled: boolean,
    expectedRevision?: number,
  ): Promise<void> {
    if (typeof enabled !== 'boolean') {
      throw new ContextManagerError('invalid-prompt-binding', 'prompt binding.enabled must be a boolean')
    }
    const state = this.requireBindingForLeafEdit(profileId, resourceId, expectedRevision)
    await this.mutate(state, [{
      op: 'set',
      path: ['profiles', profileId, 'prompts', resourceId, 'enabled'],
      value: enabled,
    }])
  }

  async setPlacement(
    profileId: string,
    resourceId: string,
    placement: PromptPlacement,
    expectedRevision?: number,
  ): Promise<void> {
    let parsed: PromptPlacement
    try {
      parsed = parsePromptPlacement(placement)
    } catch (error) {
      throw new ContextManagerError(
        'invalid-prompt-placement',
        error instanceof Error ? error.message : String(error),
      )
    }
    const state = this.requireBindingForLeafEdit(profileId, resourceId, expectedRevision)
    await this.mutate(state, [{
      op: 'set',
      path: ['profiles', profileId, 'prompts', resourceId, 'placement'],
      value: parsed,
    }])
  }

  async setOrder(
    profileId: string,
    resourceId: string,
    order: number,
    expectedRevision?: number,
  ): Promise<void> {
    let parsed: number
    try {
      parsed = parsePromptOrder(order)
    } catch (error) {
      throw new ContextManagerError(
        'invalid-prompt-order',
        error instanceof Error ? error.message : String(error),
      )
    }
    const state = this.requireBindingForLeafEdit(profileId, resourceId, expectedRevision)
    await this.mutate(state, [{
      op: 'set',
      path: ['profiles', profileId, 'prompts', resourceId, 'order'],
      value: parsed,
    }])
  }

  async remove(
    profileId: string,
    resourceId: string,
    expectedRevision?: number,
  ): Promise<void> {
    assertSafePathKey(profileId, 'profile id')
    assertSafePathKey(resourceId, 'prompt resource id')
    const state = this.captureWritableState(expectedRevision)
    const prompts = this.requirePromptsObjectOrAbsent(state.stored, profileId)
    if (prompts === undefined || !Object.hasOwn(prompts, resourceId)) {
      throw new ContextManagerError(
        'prompt-binding-not-found',
        `profile ${JSON.stringify(profileId)} has no stored prompt binding ${JSON.stringify(resourceId)}`,
      )
    }
    await this.mutate(state, [{
      op: 'unset',
      path: ['profiles', profileId, 'prompts', resourceId],
    }])
  }

  private validateBindingInput(input: unknown): void {
    try {
      parsePromptBinding(input)
    } catch (error) {
      throw new ContextManagerError(
        'invalid-prompt-binding',
        error instanceof Error ? error.message : String(error),
      )
    }
    assertStoredProfilePayloadSafe(input)
  }

  private requireBindingForLeafEdit(
    profileId: string,
    resourceId: string,
    expectedRevision?: number,
  ): WritableState {
    assertSafePathKey(profileId, 'profile id')
    assertSafePathKey(resourceId, 'prompt resource id')
    const state = this.captureWritableState(expectedRevision)
    const prompts = this.requirePromptsObjectOrAbsent(state.stored, profileId)
    if (prompts === undefined || !Object.hasOwn(prompts, resourceId)) {
      throw new ContextManagerError(
        'prompt-binding-not-found',
        `profile ${JSON.stringify(profileId)} has no stored prompt binding ${JSON.stringify(resourceId)}`,
      )
    }
    if (!isPlainObject(prompts[resourceId])) {
      throw new ContextManagerError(
        'profile-path-not-editable',
        `profile ${JSON.stringify(profileId)} prompt binding ${JSON.stringify(resourceId)} is not an object; remove it explicitly before adding a structured binding`,
      )
    }
    return state
  }

  private requirePromptsObjectOrAbsent(
    stored: StoredContextManagerSettings,
    profileId: string,
  ): Record<string, unknown> | undefined {
    if (!Object.hasOwn(stored.profiles, profileId)) {
      throw new ContextManagerError('profile-not-found', `profile ${JSON.stringify(profileId)} does not exist`)
    }
    const profile = stored.profiles[profileId]
    if (!isPlainObject(profile)) {
      throw new ContextManagerError(
        'profile-path-not-editable',
        `profile ${JSON.stringify(profileId)} is not an object; use the stored-payload editor or replace it explicitly`,
      )
    }
    if (profile.prompts === undefined) return undefined
    if (!isPlainObject(profile.prompts)) {
      throw new ContextManagerError(
        'profile-path-not-editable',
        `profile ${JSON.stringify(profileId)} has a non-object prompts field; use the stored-payload editor or replace the profile explicitly`,
      )
    }
    return profile.prompts
  }

  private assertCurrentUserDocumentWritable(descriptor: SettingsDescriptor): void {
    if (descriptor.user === undefined) return
    try {
      CONTEXT_MANAGER_SETTINGS_SCHEMA(descriptor.user as never)
    } catch (error) {
      throw new ContextManagerError(
        'persistence-document-invalid',
        `the current stored Context Manager settings section is invalid; edit or restore that document explicitly before applying semantic mutations (${error instanceof Error ? error.message : String(error)})`,
      )
    }
  }

  private captureWritableState(expectedRevision?: number): WritableState {
    const settings = this.ownerCtx.get('settings')
    if (settings === undefined) {
      throw new ContextManagerError('persistence-unavailable', 'Context Manager settings persistence is unavailable')
    }
    if (!settings.writable) {
      throw new ContextManagerError('persistence-read-only', 'Context Manager settings provider is read-only')
    }
    const descriptor = settings.describe().find(item => item.ns === CONTEXT_MANAGER_SETTINGS_NAMESPACE)
    if (descriptor === undefined) {
      throw new ContextManagerError('persistence-not-ready', 'Context Manager settings namespace is not registered yet')
    }
    if (expectedRevision !== undefined && expectedRevision !== descriptor.revision) {
      throw new SettingsConflictError(
        CONTEXT_MANAGER_SETTINGS_NAMESPACE as never,
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
    return { settings, stored, revision: descriptor.revision }
  }

  private async mutate(state: WritableState, ops: readonly SettingsPathOp[]): Promise<void> {
    await state.settings.mutate(
      CONTEXT_MANAGER_SETTINGS_NAMESPACE as never,
      ops,
      state.revision,
    )
  }
}
