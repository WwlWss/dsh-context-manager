import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'

import type {
  ContextManagerRemoteChangeSnapshot,
  ContextManagerRemotePresetSnapshot,
  ContextManagerRemoteProfilesSnapshot,
  ContextManagerRemoteProfileInput,
  ContextManagerRemoteProfileMutationBasis,
  ContextManagerRemotePromptBinding,
  ContextManagerRemotePromptPlacement,
  ContextManagerRemotePromptPlacementCapability,
  ContextManagerRemoteProtocol,
  ContextManagerRemoteResult,
  ContextManagerRemoteMutationReceipt,
  ContextManagerRemoteDeleteReceipt,
  ContextManagerRemotePromptResourceInput,
  ContextManagerRemoteResourceCreateBasis,
  ContextManagerRemoteResourceMutationBasis,
  ContextManagerRemoteSkillMode,
  ContextManagerRemotePromptResource,
  ContextManagerRemotePromptResourceListItem,
  ContextManagerRemoteSessionPresetIdentity,
  ContextManagerRemotePromptRuntimeInspection,
  ContextManagerRemoteSkillRuntimeInspection,
  ContextManagerRemotePinnedSkillInspection,
} from '../remote/types.js'

export interface ContextManagerClientReadRemote {
  protocol(): Promise<RemoteResult<ContextManagerRemoteProtocol>>
  changes(): Promise<RemoteResult<ContextManagerRemoteChangeSnapshot>>
  profiles(): Promise<RemoteResult<ContextManagerRemoteProfilesSnapshot>>
  presets(): Promise<RemoteResult<ContextManagerRemotePresetSnapshot>>
  promptPlacement(): Promise<RemoteResult<ContextManagerRemotePromptPlacementCapability>>
}

export interface ContextManagerClientResourceReadRemote {
  listPromptResources(): Promise<RemoteResult<ContextManagerRemoteResult<readonly ContextManagerRemotePromptResourceListItem[]>>>
  getPromptResource(id: string): Promise<RemoteResult<ContextManagerRemoteResult<ContextManagerRemotePromptResource>>>
}

export interface ContextManagerClientRuntimeReadRemote {
  sessionPreset(sessionId: string): Promise<RemoteResult<ContextManagerRemoteSessionPresetIdentity>>
  inspectPromptRuntime(agentId: string): Promise<RemoteResult<ContextManagerRemotePromptRuntimeInspection>>
  inspectSkillRuntime(agentId: string): Promise<RemoteResult<ContextManagerRemoteSkillRuntimeInspection>>
  inspectPinnedSkillRuntime(agentId: string): Promise<RemoteResult<ContextManagerRemotePinnedSkillInspection>>
}

type ResourceMutationResult = Promise<RemoteResult<ContextManagerRemoteResult<ContextManagerRemoteMutationReceipt>>>
export interface ContextManagerClientResourceMutationRemote {
  createPromptResource(id: string, input: ContextManagerRemotePromptResourceInput, basis: ContextManagerRemoteResourceCreateBasis): ResourceMutationResult
  replacePromptResource(id: string, input: ContextManagerRemotePromptResourceInput, basis: ContextManagerRemoteResourceMutationBasis): ResourceMutationResult
  deletePromptResource(id: string, basis: ContextManagerRemoteResourceMutationBasis): Promise<RemoteResult<ContextManagerRemoteResult<ContextManagerRemoteDeleteReceipt>>>
  setPromptResourceName(id: string, name: string, basis: ContextManagerRemoteResourceMutationBasis): ResourceMutationResult
  setPromptResourceDescription(id: string, description: string | null, basis: ContextManagerRemoteResourceMutationBasis): ResourceMutationResult
  setPromptResourceContent(id: string, content: string, basis: ContextManagerRemoteResourceMutationBasis): ResourceMutationResult
}

type ProfileMutationResult = Promise<
  RemoteResult<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>>
>

export interface ContextManagerClientProfileMutationRemote {
  createProfile(id: string, input: ContextManagerRemoteProfileInput, basis: ContextManagerRemoteProfileMutationBasis): ProfileMutationResult
  deleteProfile(id: string, basis: ContextManagerRemoteProfileMutationBasis): ProfileMutationResult
  setDefaultProfile(id: string | null, basis: ContextManagerRemoteProfileMutationBasis): ProfileMutationResult
  setProfileName(profileId: string, name: string, basis: ContextManagerRemoteProfileMutationBasis): ProfileMutationResult
  setProfileDescription(profileId: string, description: string | null, basis: ContextManagerRemoteProfileMutationBasis): ProfileMutationResult
  setProfileBasePreset(profileId: string, basePreset: string, basis: ContextManagerRemoteProfileMutationBasis): ProfileMutationResult
  setSkillMode(profileId: string, skillName: string, mode: ContextManagerRemoteSkillMode, basis: ContextManagerRemoteProfileMutationBasis): ProfileMutationResult
  removeSkillBinding(profileId: string, skillName: string, basis: ContextManagerRemoteProfileMutationBasis): ProfileMutationResult
  addPromptBinding(profileId: string, bindingId: string, input: ContextManagerRemotePromptBinding, basis: ContextManagerRemoteProfileMutationBasis): ProfileMutationResult
  setPromptBindingResourceId(profileId: string, bindingId: string, resourceId: string, basis: ContextManagerRemoteProfileMutationBasis): ProfileMutationResult
  setPromptBindingEnabled(profileId: string, bindingId: string, enabled: boolean, basis: ContextManagerRemoteProfileMutationBasis): ProfileMutationResult
  setPromptBindingPlacement(profileId: string, bindingId: string, placement: ContextManagerRemotePromptPlacement, basis: ContextManagerRemoteProfileMutationBasis): ProfileMutationResult
  setPromptBindingOrder(profileId: string, bindingId: string, order: number, basis: ContextManagerRemoteProfileMutationBasis): ProfileMutationResult
  removePromptBinding(profileId: string, bindingId: string, basis: ContextManagerRemoteProfileMutationBasis): ProfileMutationResult
}

export interface ContextManagerClientBusinessRemote
  extends ContextManagerClientReadRemote,
    ContextManagerClientResourceReadRemote,
    ContextManagerClientRuntimeReadRemote,
    ContextManagerClientProfileMutationRemote {}
