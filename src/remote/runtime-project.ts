import type {
  ContextManagerPinnedSkillRuntimeRemotePort,
  ContextManagerPromptPlacementRemotePort,
  ContextManagerPromptPlacementSnapshotPort,
  ContextManagerPromptRuntimeRemotePort,
  ContextManagerSessionPresetRemotePort,
  ContextManagerSkillRuntimeRemotePort,
} from './host-ports.js'
import type {
  ContextManagerRemoteEffectiveProfileResolution,
  ContextManagerRemotePinnedSkillBinding,
  ContextManagerRemotePinnedSkillInspection,
  ContextManagerRemotePromptPlacementCapability,
  ContextManagerRemotePromptRuntimeBinding,
  ContextManagerRemotePromptRuntimeInspection,
  ContextManagerRemoteSessionPresetIdentity,
  ContextManagerRemoteSkillRuntimeBinding,
  ContextManagerRemoteSkillRuntimeInspection,
} from './types.js'

function projectEffectiveProfile(
  value: ContextManagerRemoteEffectiveProfileResolution,
): ContextManagerRemoteEffectiveProfileResolution {
  switch (value.status) {
    case 'no-default-profile':
      return Object.freeze({ status: 'no-default-profile' })
    case 'profile-unusable':
      return Object.freeze({
        status: 'profile-unusable',
        ...(value.configuredProfileId === undefined
          ? {}
          : { configuredProfileId: value.configuredProfileId }),
        reason: value.reason,
      })
    case 'preset-identity-unavailable':
      return Object.freeze({
        status: 'preset-identity-unavailable',
        profileId: value.profileId,
        reason: value.reason,
      })
    case 'base-preset-mismatch':
      return Object.freeze({
        status: 'base-preset-mismatch',
        profileId: value.profileId,
        expectedPresetId: value.expectedPresetId,
        actualPresetId: value.actualPresetId,
      })
    case 'active':
      return Object.freeze({
        status: 'active',
        profileId: value.profileId,
        presetId: value.presetId,
      })
  }
}

function projectPromptBinding(
  binding: ContextManagerRemotePromptRuntimeBinding,
): ContextManagerRemotePromptRuntimeBinding {
  switch (binding.state) {
    case 'disabled':
    case 'native-suppressed':
      return Object.freeze({
        state: binding.state,
        bindingId: binding.bindingId,
        resourceId: binding.resourceId,
        placement: binding.placement,
        order: binding.order,
      })
    case 'missing-resource':
    case 'invalid-resource':
    case 'empty-content':
      return Object.freeze({
        state: binding.state,
        bindingId: binding.bindingId,
        resourceId: binding.resourceId,
        placement: binding.placement,
        order: binding.order,
        ...(binding.message === undefined ? {} : { message: binding.message }),
      })
    case 'eligible':
      return Object.freeze({
        state: 'eligible',
        bindingId: binding.bindingId,
        resourceId: binding.resourceId,
        placement: binding.placement,
        order: binding.order,
        resourceRevision: binding.resourceRevision,
        nativeState: binding.nativeState,
      })
  }
}

function projectSkillBinding(
  binding: ContextManagerRemoteSkillRuntimeBinding,
): ContextManagerRemoteSkillRuntimeBinding {
  switch (binding.state) {
    case 'native-pass-through':
      return Object.freeze({
        state: 'native-pass-through',
        skillName: binding.skillName,
        mode: 'auto',
        winner: Object.freeze({
          provider: binding.winner.provider,
          invocation: Object.freeze({
            modelInvocable: binding.winner.invocation.modelInvocable,
            userInvocable: binding.winner.invocation.userInvocable,
          }),
        }),
      })
    case 'policy-applied':
      return Object.freeze({
        state: 'policy-applied',
        skillName: binding.skillName,
        mode: binding.mode,
        nativeProvider: binding.nativeProvider,
        expectedInvocation: Object.freeze({
          modelInvocable: binding.expectedInvocation.modelInvocable,
          userInvocable: binding.expectedInvocation.userInvocable,
        }),
      })
    case 'policy-not-effective':
      return Object.freeze({
        state: 'policy-not-effective',
        skillName: binding.skillName,
        mode: binding.mode,
        ...(binding.nativeProvider === undefined ? {} : { nativeProvider: binding.nativeProvider }),
        expectedInvocation: Object.freeze({
          modelInvocable: binding.expectedInvocation.modelInvocable,
          userInvocable: binding.expectedInvocation.userInvocable,
        }),
        ...(binding.winner === undefined
          ? {}
          : {
              winner: Object.freeze({
                provider: binding.winner.provider,
                invocation: Object.freeze({
                  modelInvocable: binding.winner.invocation.modelInvocable,
                  userInvocable: binding.winner.invocation.userInvocable,
                }),
              }),
            }),
      })
    case 'missing-native-skill':
    case 'catalog-incomplete':
      return Object.freeze({
        state: binding.state,
        skillName: binding.skillName,
        mode: binding.mode,
      })
  }
}

function projectPinnedBinding(
  binding: ContextManagerRemotePinnedSkillBinding,
): ContextManagerRemotePinnedSkillBinding {
  switch (binding.state) {
    case 'loaded':
    case 'definition-unavailable':
      return Object.freeze({
        state: binding.state,
        skillName: binding.skillName,
        nativeProvider: binding.nativeProvider,
      })
    case 'missing-native-skill':
    case 'catalog-incomplete':
      return Object.freeze({
        state: binding.state,
        skillName: binding.skillName,
      })
    case 'policy-not-effective':
      return Object.freeze({
        state: 'policy-not-effective',
        skillName: binding.skillName,
        nativeProvider: binding.nativeProvider,
        ...(binding.winnerProvider === undefined ? {} : { winnerProvider: binding.winnerProvider }),
      })
  }
}

export function projectSessionPreset(
  snapshot: ContextManagerRemoteSessionPresetIdentity,
): ContextManagerRemoteSessionPresetIdentity {
  switch (snapshot.status) {
    case 'unavailable':
    case 'not-live':
      return Object.freeze({ status: snapshot.status, sessionId: snapshot.sessionId })
    case 'known':
      return Object.freeze({
        status: 'known',
        sessionId: snapshot.sessionId,
        presetId: snapshot.presetId,
      })
  }
}

export function projectPromptPlacement(
  snapshot: ContextManagerPromptPlacementSnapshotPort,
): ContextManagerRemotePromptPlacementCapability {
  if (snapshot.status === 'unavailable') {
    return Object.freeze({ status: 'unavailable' })
  }
  return Object.freeze({
    status: 'available',
    placements: Object.freeze({
      'before-persona': snapshot.placements['before-persona'],
      'after-persona': snapshot.placements['after-persona'],
      'before-tool-guidance': snapshot.placements['before-tool-guidance'],
      'after-tool-guidance': snapshot.placements['after-tool-guidance'],
      'runtime-context': snapshot.placements['runtime-context'],
    }),
  })
}

export async function projectPromptRuntime(
  port: ContextManagerPromptRuntimeRemotePort,
  agentId: string,
): Promise<ContextManagerRemotePromptRuntimeInspection> {
  const snapshot = await port.inspect(agentId)
  switch (snapshot.status) {
    case 'runtime-unavailable':
      return Object.freeze({ status: 'runtime-unavailable' })
    case 'agent-not-live':
    case 'assembly-bypassed':
      return Object.freeze({ status: snapshot.status, agentId: snapshot.agentId })
    case 'resolved':
      return Object.freeze({
        status: 'resolved',
        agentId: snapshot.agentId,
        profile: projectEffectiveProfile(snapshot.profile),
        bindings: Object.freeze(snapshot.bindings.map(projectPromptBinding)),
      })
  }
}

export async function projectSkillRuntime(
  port: ContextManagerSkillRuntimeRemotePort,
  agentId: string,
): Promise<ContextManagerRemoteSkillRuntimeInspection> {
  const snapshot = await port.inspect(agentId)
  switch (snapshot.status) {
    case 'runtime-unavailable':
      return Object.freeze({ status: 'runtime-unavailable' })
    case 'agent-not-live':
      return Object.freeze({ status: 'agent-not-live', agentId: snapshot.agentId })
    case 'resolved':
      return Object.freeze({
        status: 'resolved',
        agentId: snapshot.agentId,
        profile: projectEffectiveProfile(snapshot.profile),
        catalogComplete: snapshot.catalogComplete,
        bindings: Object.freeze(snapshot.bindings.map(projectSkillBinding)),
      })
  }
}

export async function projectPinnedRuntime(
  port: ContextManagerPinnedSkillRuntimeRemotePort,
  agentId: string,
): Promise<ContextManagerRemotePinnedSkillInspection> {
  const snapshot = await port.inspect(agentId)
  switch (snapshot.status) {
    case 'runtime-unavailable':
      return Object.freeze({ status: 'runtime-unavailable' })
    case 'agent-not-live':
    case 'assembly-bypassed':
      return Object.freeze({ status: snapshot.status, agentId: snapshot.agentId })
    case 'resolved':
      return Object.freeze({
        status: 'resolved',
        agentId: snapshot.agentId,
        profile: projectEffectiveProfile(snapshot.profile),
        catalogComplete: snapshot.catalogComplete,
        nativeState: snapshot.nativeState,
        bindings: Object.freeze(snapshot.bindings.map(projectPinnedBinding)),
      })
  }
}
