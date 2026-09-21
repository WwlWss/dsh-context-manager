import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

import type {
  ContextManagerProfileRemotePort,
  ContextManagerPromptRemotePort,
} from '../remote/host-ports.js'
import {
  projectProfilesSnapshot,
  projectPromptResource,
  projectPromptResourceList,
} from '../remote/project.js'
import {
  businessResult,
  fail,
  invalidRevision,
  ok,
} from '../remote/results.js'
import {
  CONTEXT_MANAGER_REMOTE_API_VERSION,
  type ContextManagerRemoteDeleteReceipt,
  type ContextManagerRemoteMutationReceipt,
  type ContextManagerRemoteProfileInput,
  type ContextManagerRemoteProfilesSnapshot,
  type ContextManagerRemotePromptBinding,
  type ContextManagerRemotePromptPlacement,
  type ContextManagerRemotePromptResource,
  type ContextManagerRemotePromptResourceInput,
  type ContextManagerRemotePromptResourceListItem,
  type ContextManagerRemoteProtocol,
  type ContextManagerRemoteResult,
  type ContextManagerRemoteSkillMode,
} from '../remote/types.js'

type RemoteContextPorts = {
  readonly dshContextManager?: ContextManagerProfileRemotePort
  readonly dshContextPromptLibrary?: ContextManagerPromptRemotePort
}

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
    return projectProfilesSnapshot(this.profilePort().snapshotForWire())
  }

  @Remote
  async createProfile(
    id: string,
    input: ContextManagerRemoteProfileInput,
    expectedRevision: number,
  ): Promise<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>> {
    return this.profileMutation(expectedRevision, port => port.createProfile(id, input, expectedRevision))
  }

  @Remote
  async deleteProfile(
    id: string,
    expectedRevision: number,
  ): Promise<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>> {
    return this.profileMutation(expectedRevision, port => port.deleteProfile(id, expectedRevision))
  }

  @Remote
  async setDefaultProfile(
    id: string | null,
    expectedRevision: number,
  ): Promise<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>> {
    return this.profileMutation(
      expectedRevision,
      port => port.setDefaultProfile(id === null ? undefined : id, expectedRevision),
    )
  }

  @Remote
  async setProfileName(
    profileId: string,
    name: string,
    expectedRevision: number,
  ): Promise<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>> {
    return this.profileMutation(
      expectedRevision,
      port => port.setProfileName(profileId, name, expectedRevision),
    )
  }

  @Remote
  async setProfileDescription(
    profileId: string,
    description: string | null,
    expectedRevision: number,
  ): Promise<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>> {
    return this.profileMutation(
      expectedRevision,
      port => port.setProfileDescription(
        profileId,
        description === null ? undefined : description,
        expectedRevision,
      ),
    )
  }

  @Remote
  async setProfileBasePreset(
    profileId: string,
    basePreset: string,
    expectedRevision: number,
  ): Promise<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>> {
    return this.profileMutation(
      expectedRevision,
      port => port.setProfileBasePreset(profileId, basePreset, expectedRevision),
    )
  }

  @Remote
  async setSkillMode(
    profileId: string,
    skillName: string,
    mode: ContextManagerRemoteSkillMode,
    expectedRevision: number,
  ): Promise<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>> {
    return this.profileMutation(
      expectedRevision,
      port => port.setSkillMode(profileId, skillName, mode, expectedRevision),
    )
  }

  @Remote
  async removeSkillBinding(
    profileId: string,
    skillName: string,
    expectedRevision: number,
  ): Promise<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>> {
    return this.profileMutation(
      expectedRevision,
      port => port.removeSkillBinding(profileId, skillName, expectedRevision),
    )
  }

  @Remote
  async addPromptBinding(
    profileId: string,
    bindingId: string,
    input: ContextManagerRemotePromptBinding,
    expectedRevision: number,
  ): Promise<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>> {
    return this.profileMutation(
      expectedRevision,
      port => port.addPromptBinding(profileId, bindingId, input, expectedRevision),
    )
  }

  @Remote
  async setPromptBindingResourceId(
    profileId: string,
    bindingId: string,
    resourceId: string,
    expectedRevision: number,
  ): Promise<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>> {
    return this.profileMutation(
      expectedRevision,
      port => port.setPromptBindingResourceId(
        profileId,
        bindingId,
        resourceId,
        expectedRevision,
      ),
    )
  }

  @Remote
  async setPromptBindingEnabled(
    profileId: string,
    bindingId: string,
    enabled: boolean,
    expectedRevision: number,
  ): Promise<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>> {
    return this.profileMutation(
      expectedRevision,
      port => port.setPromptBindingEnabled(profileId, bindingId, enabled, expectedRevision),
    )
  }

  @Remote
  async setPromptBindingPlacement(
    profileId: string,
    bindingId: string,
    placement: ContextManagerRemotePromptPlacement,
    expectedRevision: number,
  ): Promise<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>> {
    return this.profileMutation(
      expectedRevision,
      port => port.setPromptBindingPlacement(
        profileId,
        bindingId,
        placement,
        expectedRevision,
      ),
    )
  }

  @Remote
  async setPromptBindingOrder(
    profileId: string,
    bindingId: string,
    order: number,
    expectedRevision: number,
  ): Promise<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>> {
    return this.profileMutation(
      expectedRevision,
      port => port.setPromptBindingOrder(profileId, bindingId, order, expectedRevision),
    )
  }

  @Remote
  async removePromptBinding(
    profileId: string,
    bindingId: string,
    expectedRevision: number,
  ): Promise<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>> {
    return this.profileMutation(
      expectedRevision,
      port => port.removePromptBinding(profileId, bindingId, expectedRevision),
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
    const invalid = this.promptRevisionError(expectedRevision)
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
    const invalid = this.promptRevisionError(expectedRevision)
    if (invalid !== undefined) return invalid
    return businessResult(async () => {
      await this.promptPort().deletePrompt(id, expectedRevision)
      return Object.freeze({ id })
    })
  }

  private profilePort(): ContextManagerProfileRemotePort {
    const port = (this.ownerCtx as unknown as RemoteContextPorts).dshContextManager
    if (port === undefined) {
      throw new Error('dsh-context-manager: Context Manager profile Host service is unavailable')
    }
    return port
  }

  private promptPort(): ContextManagerPromptRemotePort {
    const port = (this.ownerCtx as unknown as RemoteContextPorts).dshContextPromptLibrary
    if (port === undefined) {
      const error = new Error('Context Manager prompt library storage is not ready') as Error & {
        code: string
      }
      error.code = 'prompt-library-not-ready'
      throw error
    }
    return port
  }

  private async profileMutation(
    expectedRevision: number,
    mutate: (port: ContextManagerProfileRemotePort) => Promise<void>,
  ): Promise<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>> {
    const invalid = invalidRevision(expectedRevision)
    if (invalid !== undefined) return fail(invalid)
    return businessResult(async () => {
      const port = this.profilePort()
      await mutate(port)
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
    const record = error as { readonly code?: unknown; readonly message?: unknown }
    if (typeof record?.code === 'string') {
      return businessResult<T>(() => { throw error }) as unknown as ContextManagerRemoteResult<T>
    }
    throw error
  }
}
