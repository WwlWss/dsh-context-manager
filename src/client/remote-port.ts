import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'

import type {
  ContextManagerRemoteChangeSnapshot,
  ContextManagerRemotePresetSnapshot,
  ContextManagerRemoteProfilesSnapshot,
  ContextManagerRemoteProfileInput,
  ContextManagerRemotePromptBinding,
  ContextManagerRemotePromptPlacement,
  ContextManagerRemotePromptPlacementCapability,
  ContextManagerRemoteProtocol,
  ContextManagerRemoteResult,
  ContextManagerRemoteSkillMode,
} from '../remote/types.js'

export interface ContextManagerClientReadRemote {
  protocol(): Promise<RemoteResult<ContextManagerRemoteProtocol>>
  changes(): Promise<RemoteResult<ContextManagerRemoteChangeSnapshot>>
  profiles(): Promise<RemoteResult<ContextManagerRemoteProfilesSnapshot>>
  presets(): Promise<RemoteResult<ContextManagerRemotePresetSnapshot>>
  promptPlacement(): Promise<RemoteResult<ContextManagerRemotePromptPlacementCapability>>
}

type ProfileMutationResult = Promise<
  RemoteResult<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>>
>

export interface ContextManagerClientProfileMutationRemote {
  createProfile(id: string, input: ContextManagerRemoteProfileInput, expectedRevision: number): ProfileMutationResult
  deleteProfile(id: string, expectedRevision: number): ProfileMutationResult
  setDefaultProfile(id: string | null, expectedRevision: number): ProfileMutationResult
  setProfileName(profileId: string, name: string, expectedRevision: number): ProfileMutationResult
  setProfileDescription(profileId: string, description: string | null, expectedRevision: number): ProfileMutationResult
  setProfileBasePreset(profileId: string, basePreset: string, expectedRevision: number): ProfileMutationResult
  setSkillMode(profileId: string, skillName: string, mode: ContextManagerRemoteSkillMode, expectedRevision: number): ProfileMutationResult
  removeSkillBinding(profileId: string, skillName: string, expectedRevision: number): ProfileMutationResult
  addPromptBinding(profileId: string, bindingId: string, input: ContextManagerRemotePromptBinding, expectedRevision: number): ProfileMutationResult
  setPromptBindingResourceId(profileId: string, bindingId: string, resourceId: string, expectedRevision: number): ProfileMutationResult
  setPromptBindingEnabled(profileId: string, bindingId: string, enabled: boolean, expectedRevision: number): ProfileMutationResult
  setPromptBindingPlacement(profileId: string, bindingId: string, placement: ContextManagerRemotePromptPlacement, expectedRevision: number): ProfileMutationResult
  setPromptBindingOrder(profileId: string, bindingId: string, order: number, expectedRevision: number): ProfileMutationResult
  removePromptBinding(profileId: string, bindingId: string, expectedRevision: number): ProfileMutationResult
}

export interface ContextManagerClientBusinessRemote
  extends ContextManagerClientReadRemote, ContextManagerClientProfileMutationRemote {}
