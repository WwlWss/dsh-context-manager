import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

import type {
  ContextManagerChangeRemotePort,
  ContextManagerPinnedSkillRuntimeRemotePort,
  ContextManagerPresetAuthoringRemotePort,
  ContextManagerPresetDirectoryRemotePort,
  ContextManagerProfileRemotePort,
  ContextManagerPromptPlacementRemotePort,
  ContextManagerPromptRemotePort,
  ContextManagerPromptRuntimeRemotePort,
  ContextManagerSessionPresetRemotePort,
  ContextManagerSkillRuntimeRemotePort,
} from '../remote/host-ports.js'
import { projectPresetSnapshot } from '../remote/preset-project.js'
import {
  projectProfilesSnapshot,
  projectPromptResource,
  projectPromptResourceList,
} from '../remote/project.js'
import {
  projectPinnedRuntime,
  projectPromptPlacement,
  projectPromptRuntime,
  projectSessionPreset,
  projectSkillRuntime,
} from '../remote/runtime-project.js'
import {
  businessResult,
  fail,
  hostInstanceConflict,
  invalidRevision,
  mapBusinessError,
  ok,
  remoteRead,
  remoteReadAsync,
  sanitizeUnexpectedRemoteError,
} from '../remote/results.js'
import {
  CONTEXT_MANAGER_REMOTE_API_VERSION,
  type ContextManagerRemoteChangeSnapshot,
  type ContextManagerRemoteDeleteReceipt,
  type ContextManagerRemoteMutationReceipt,
  type ContextManagerRemotePinnedSkillInspection,
  type ContextManagerRemotePresetDocument,
  type ContextManagerRemotePresetReceipt,
  type ContextManagerRemotePresetSnapshot,
  type ContextManagerRemoteProfileInput,
  type ContextManagerRemoteProfileMutationBasis,
  type ContextManagerRemoteProfilesSnapshot,
  type ContextManagerRemotePromptBinding,
  type ContextManagerRemotePromptPlacement,
  type ContextManagerRemotePromptPlacementCapability,
  type ContextManagerRemotePromptRuntimeInspection,
  type ContextManagerRemotePromptResource,
  type ContextManagerRemotePromptResourceInput,
  type ContextManagerRemotePromptResourceListItem,
  type ContextManagerRemoteProtocol,
  type ContextManagerRemoteResult,
  type ContextManagerRemoteSessionPresetIdentity,
  type ContextManagerRemoteSkillMode,
  type ContextManagerRemoteSkillRuntimeInspection,
} from '../remote/types.js'

export class ContextManagerRemoteService extends TypertRemoteService {
  private readonly ownerCtx: Context

  constructor(ctx: Context) {
    super(ctx, 'dshContextRemote', { namespace: 'contextManager' })
    this.ownerCtx = ctx
  }

  @Remote
  protocol(): ContextManagerRemoteProtocol {
    return Object.freeze({ apiVersion: CONTEXT_MANAGER_REMOTE_API_VERSION })
  }

  @Remote
  profiles(): ContextManagerRemoteProfilesSnapshot {
    return remoteRead(() => projectProfilesSnapshot(this.profilePort().snapshotForWire()))
  }

  @Remote
  async createProfile(
    id: string,
    input: ContextManagerRemoteProfileInput,
    basis: ContextManagerRemoteProfileMutationBasis,
  ): Promise<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>> {
    return this.profileMutation(
      basis,
      (port, revision) => port.createProfile(id, input, revision),
    )
  }

  @Remote
  async deleteProfile(
    id: string,
    basis: ContextManagerRemoteProfileMutationBasis,
  ): Promise<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>> {
    return this.profileMutation(
      basis,
      (port, revision) => port.deleteProfile(id, revision),
    )
  }

  @Remote
  async setDefaultProfile(
    id: string | null,
    basis: ContextManagerRemoteProfileMutationBasis,
  ): Promise<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>> {
    return this.profileMutation(
      basis,
      (port, revision) => port.setDefaultProfile(id === null ? undefined : id, revision),
    )
  }

  @Remote
  async setProfileName(
    profileId: string,
    name: string,
    basis: ContextManagerRemoteProfileMutationBasis,
  ): Promise<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>> {
    return this.profileMutation(
      basis,
      (port, revision) => port.setProfileName(profileId, name, revision),
    )
  }

  @Remote
  async setProfileDescription(
    profileId: string,
    description: string | null,
    basis: ContextManagerRemoteProfileMutationBasis,
  ): Promise<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>> {
    return this.profileMutation(
      basis,
      (port, revision) => port.setProfileDescription(
        profileId,
        description === null ? undefined : description,
        revision,
      ),
    )
  }

  @Remote
  async setProfileBasePreset(
    profileId: string,
    basePreset: string,
    basis: ContextManagerRemoteProfileMutationBasis,
  ): Promise<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>> {
    return this.profileMutation(
      basis,
      (port, revision) => port.setProfileBasePreset(profileId, basePreset, revision),
    )
  }

  @Remote
  async setSkillMode(
    profileId: string,
    skillName: string,
    mode: ContextManagerRemoteSkillMode,
    basis: ContextManagerRemoteProfileMutationBasis,
  ): Promise<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>> {
    return this.profileMutation(
      basis,
      (port, revision) => port.setSkillMode(profileId, skillName, mode, revision),
    )
  }

  @Remote
  async removeSkillBinding(
    profileId: string,
    skillName: string,
    basis: ContextManagerRemoteProfileMutationBasis,
  ): Promise<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>> {
    return this.profileMutation(
      basis,
      (port, revision) => port.removeSkillBinding(profileId, skillName, revision),
    )
  }

  @Remote
  async addPromptBinding(
    profileId: string,
    bindingId: string,
    input: ContextManagerRemotePromptBinding,
    basis: ContextManagerRemoteProfileMutationBasis,
  ): Promise<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>> {
    return this.profileMutation(
      basis,
      (port, revision) => port.addPromptBinding(profileId, bindingId, input, revision),
    )
  }

  @Remote
  async setPromptBindingResourceId(
    profileId: string,
    bindingId: string,
    resourceId: string,
    basis: ContextManagerRemoteProfileMutationBasis,
  ): Promise<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>> {
    return this.profileMutation(
      basis,
      (port, revision) => port.setPromptBindingResourceId(
        profileId,
        bindingId,
        resourceId,
        revision,
      ),
    )
  }

  @Remote
  async setPromptBindingEnabled(
    profileId: string,
    bindingId: string,
    enabled: boolean,
    basis: ContextManagerRemoteProfileMutationBasis,
  ): Promise<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>> {
    return this.profileMutation(
      basis,
      (port, revision) => port.setPromptBindingEnabled(profileId, bindingId, enabled, revision),
    )
  }

  @Remote
  async setPromptBindingPlacement(
    profileId: string,
    bindingId: string,
    placement: ContextManagerRemotePromptPlacement,
    basis: ContextManagerRemoteProfileMutationBasis,
  ): Promise<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>> {
    return this.profileMutation(
      basis,
      (port, revision) => port.setPromptBindingPlacement(
        profileId,
        bindingId,
        placement,
        revision,
      ),
    )
  }

  @Remote
  async setPromptBindingOrder(
    profileId: string,
    bindingId: string,
    order: number,
    basis: ContextManagerRemoteProfileMutationBasis,
  ): Promise<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>> {
    return this.profileMutation(
      basis,
      (port, revision) => port.setPromptBindingOrder(profileId, bindingId, order, revision),
    )
  }

  @Remote
  async removePromptBinding(
    profileId: string,
    bindingId: string,
    basis: ContextManagerRemoteProfileMutationBasis,
  ): Promise<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>> {
    return this.profileMutation(
      basis,
      (port, revision) => port.removePromptBinding(profileId, bindingId, revision),
    )
  }

  @Remote
  listPromptResources(): ContextManagerRemoteResult<readonly ContextManagerRemotePromptResourceListItem[]> {
    try {
      return ok(projectPromptResourceList(this.promptPort().list()))
    } catch (error) {
      return this.businessFailureOrThrow(error)
    }
  }

  @Remote
  getPromptResource(
    id: string,
  ): ContextManagerRemoteResult<ContextManagerRemotePromptResource> {
    try {
      return ok(projectPromptResource(this.promptPort().get(id)))
    } catch (error) {
      return this.businessFailureOrThrow(error)
    }
  }

  @Remote
  async createPromptResource(
    id: string,
    input: ContextManagerRemotePromptResourceInput,
  ): Promise<ContextManagerRemoteResult<ContextManagerRemoteMutationReceipt>> {
    return businessResult(async () => {
      const receipt = await this.promptPort().createPrompt(id, input)
      return Object.freeze({ id: receipt.id, revision: receipt.revision })
    })
  }

  @Remote
  async replacePromptResource(
    id: string,
    input: ContextManagerRemotePromptResourceInput,
    expectedRevision: number,
  ): Promise<ContextManagerRemoteResult<ContextManagerRemoteMutationReceipt>> {
    const invalid = this.promptRevisionError<ContextManagerRemoteMutationReceipt>(expectedRevision)
    if (invalid !== undefined) return invalid
    return businessResult(async () => {
      const receipt = await this.promptPort().replacePrompt(id, input, expectedRevision)
      return Object.freeze({ id: receipt.id, revision: receipt.revision })
    })
  }

  @Remote
  async deletePromptResource(
    id: string,
    expectedRevision: number,
  ): Promise<ContextManagerRemoteResult<ContextManagerRemoteDeleteReceipt>> {
    const invalid = this.promptRevisionError<ContextManagerRemoteDeleteReceipt>(expectedRevision)
    if (invalid !== undefined) return invalid
    return businessResult(async () => {
      await this.promptPort().deletePrompt(id, expectedRevision)
      return Object.freeze({ id })
    })
  }

  @Remote
  async presets(): Promise<ContextManagerRemotePresetSnapshot> {
    return remoteReadAsync(async () => (
      projectPresetSnapshot(await this.presetDirectoryPort().snapshotForWire())
    ))
  }

  @Remote
  async readPreset(
    id: string,
  ): Promise<ContextManagerRemoteResult<ContextManagerRemotePresetDocument>> {
    return businessResult(async () => Object.freeze({
      id,
      content: await this.presetAuthoringPort().read(id),
    }))
  }

  @Remote
  async copyPreset(
    from: string,
    id: string,
    name: string | null,
  ): Promise<ContextManagerRemoteResult<ContextManagerRemotePresetReceipt>> {
    return businessResult(async () => {
      await this.presetAuthoringPort().copy(from, id, name === null ? undefined : name)
      return Object.freeze({ id })
    })
  }

  @Remote
  async removePreset(
    id: string,
  ): Promise<ContextManagerRemoteResult<ContextManagerRemotePresetReceipt>> {
    return businessResult(async () => {
      await this.presetAuthoringPort().remove(id)
      return Object.freeze({ id })
    })
  }

  @Remote
  sessionPreset(sessionId: string): ContextManagerRemoteSessionPresetIdentity {
    return remoteRead(() => projectSessionPreset(this.sessionPresetPort().snapshot(sessionId)))
  }

  @Remote
  promptPlacement(): ContextManagerRemotePromptPlacementCapability {
    return remoteRead(() => projectPromptPlacement(this.promptPlacementPort().snapshot()))
  }

  @Remote
  async inspectPromptRuntime(
    agentId: string,
  ): Promise<ContextManagerRemotePromptRuntimeInspection> {
    return remoteReadAsync(() => projectPromptRuntime(this.promptRuntimePort(), agentId))
  }

  @Remote
  async inspectSkillRuntime(
    agentId: string,
  ): Promise<ContextManagerRemoteSkillRuntimeInspection> {
    return remoteReadAsync(() => projectSkillRuntime(this.skillRuntimePort(), agentId))
  }

  @Remote
  async inspectPinnedSkillRuntime(
    agentId: string,
  ): Promise<ContextManagerRemotePinnedSkillInspection> {
    return remoteReadAsync(() => projectPinnedRuntime(this.pinnedRuntimePort(), agentId))
  }

  @Remote
  changes(): ContextManagerRemoteChangeSnapshot {
    return remoteRead(() => {
      const snapshot = this.changePort().snapshot()
      return Object.freeze({
        instanceId: snapshot.instanceId,
        generation: snapshot.generation,
        profiles: snapshot.profiles,
        promptResources: snapshot.promptResources,
        presets: snapshot.presets,
        runtime: snapshot.runtime,
      })
    })
  }

  private profilePort(): ContextManagerProfileRemotePort {
    const port = this.ownerCtx.get('dshContextManager') as ContextManagerProfileRemotePort | undefined
    if (port === undefined) {
      throw new Error('dsh-context-manager: Context Manager profile Host service is unavailable')
    }
    return port
  }

  private promptPort(): ContextManagerPromptRemotePort {
    const port = this.ownerCtx.get('dshContextPromptLibrary') as ContextManagerPromptRemotePort | undefined
    if (port === undefined) {
      const error = new Error('Context Manager prompt library storage is not ready') as Error & {
        code: string
      }
      error.code = 'prompt-library-not-ready'
      throw error
    }
    return port
  }

  private presetDirectoryPort(): ContextManagerPresetDirectoryRemotePort {
    return this.requirePort<ContextManagerPresetDirectoryRemotePort>(
      'dshContextPresetDirectory',
      'preset directory',
    )
  }

  private presetAuthoringPort(): ContextManagerPresetAuthoringRemotePort {
    return this.requirePort<ContextManagerPresetAuthoringRemotePort>(
      'dshContextPresetAuthoring',
      'preset authoring',
    )
  }

  private sessionPresetPort(): ContextManagerSessionPresetRemotePort {
    return this.requirePort<ContextManagerSessionPresetRemotePort>(
      'dshContextSessionPresetIdentity',
      'Session preset identity',
    )
  }

  private promptPlacementPort(): ContextManagerPromptPlacementRemotePort {
    return this.requirePort<ContextManagerPromptPlacementRemotePort>(
      'dshContextPromptPlacement',
      'prompt placement',
    )
  }

  private promptRuntimePort(): ContextManagerPromptRuntimeRemotePort {
    return this.requirePort<ContextManagerPromptRuntimeRemotePort>(
      'dshContextPromptRuntime',
      'Prompt Runtime',
    )
  }

  private skillRuntimePort(): ContextManagerSkillRuntimeRemotePort {
    return this.requirePort<ContextManagerSkillRuntimeRemotePort>(
      'dshContextSkillRuntime',
      'Skill Runtime',
    )
  }

  private pinnedRuntimePort(): ContextManagerPinnedSkillRuntimeRemotePort {
    return this.requirePort<ContextManagerPinnedSkillRuntimeRemotePort>(
      'dshContextPinnedSkillRuntime',
      'Pinned Skill Runtime',
    )
  }

  private changePort(): ContextManagerChangeRemotePort {
    return this.requirePort<ContextManagerChangeRemotePort>(
      'dshContextChanges',
      'change tracker',
    )
  }

  private requirePort<T>(key: string, label: string): T {
    const context = this.ownerCtx as unknown as {
      get(service: string): unknown
    }
    const port = context.get(key) as T | undefined
    if (port === undefined) {
      throw new Error(`dsh-context-manager: Context Manager ${label} Host service is unavailable`)
    }
    return port
  }

  private async profileMutation(
    basis: ContextManagerRemoteProfileMutationBasis,
    mutate: (
      port: ContextManagerProfileRemotePort,
      expectedRevision: number,
    ) => Promise<void>,
  ): Promise<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>> {
    const invalid = invalidRevision(basis.revision)
    if (invalid !== undefined) return fail(invalid)

    const actualInstanceId = this.changePort().snapshot().instanceId
    if (actualInstanceId !== basis.instanceId) {
      return fail(hostInstanceConflict(basis.instanceId, actualInstanceId))
    }

    return businessResult(async () => {
      const port = this.profilePort()
      await mutate(port, basis.revision)
      return projectProfilesSnapshot(port.snapshotForWire())
    })
  }

  private promptRevisionError<T>(
    expectedRevision: number,
  ): ContextManagerRemoteResult<T> | undefined {
    const invalid = invalidRevision(expectedRevision)
    return invalid === undefined ? undefined : fail(invalid)
  }

  private businessFailureOrThrow<T>(error: unknown): ContextManagerRemoteResult<T> {
    const mapped = mapBusinessError(error)
    if (mapped === undefined) throw sanitizeUnexpectedRemoteError(error)
    return fail(mapped)
  }
}
