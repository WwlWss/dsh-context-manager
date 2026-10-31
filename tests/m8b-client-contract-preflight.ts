/**
 * M8B B0 compile-only capability proof.
 * This file must be compiled against REAL retained DSH Client/React package
 * declarations in the temporary published B0 matrix; it is not a UI test.
 */
import type { ContextManagerClientBusinessFace } from '../src/client/business-face.js'
import type { ContextManagerClientModel } from '../src/client/model.js'
import type {
  ContextManagerClientProfileMutationBasis,
  ContextManagerClientProfileMutationResult,
} from '../src/client/mutation-types.js'
import type {
  ContextManagerClientLazyReadResult,
  ContextManagerClientSurface,
} from '../src/client/model-types.js'
import type {
  ContextManagerRemotePinnedSkillInspection,
  ContextManagerRemoteSkillMode,
  ContextManagerRemoteSkillRuntimeInspection,
} from '../src/remote/types.js'

type Assert<T extends true> = T
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false

type SkillMutationUsesOriginalBasis = Assert<Equal<
  Parameters<ContextManagerClientBusinessFace['profileMutations']['setSkillMode']>[0],
  ContextManagerClientProfileMutationBasis
>>
type RemoveUsesOriginalBasis = Assert<Equal<
  Parameters<ContextManagerClientBusinessFace['profileMutations']['removeSkillBinding']>[0],
  ContextManagerClientProfileMutationBasis
>>
type SkillMutationIsOneProfileResult = Assert<Equal<
  ReturnType<ContextManagerClientBusinessFace['profileMutations']['setSkillMode']>,
  Promise<ContextManagerClientProfileMutationResult>
>>
type RemoveIsOneProfileResult = Assert<Equal<
  ReturnType<ContextManagerClientBusinessFace['profileMutations']['removeSkillBinding']>,
  Promise<ContextManagerClientProfileMutationResult>
>>

function verifyPublishedClientSkills(
  face: ContextManagerClientBusinessFace,
  model: ContextManagerClientModel,
): void {
  const original: ContextManagerClientProfileMutationBasis =
    face.captureProfileMutationBasis() ?? { instanceId: 'captured-host', revision: 7 }
  const mode: ContextManagerRemoteSkillMode = 'pinned'
  const configured: Promise<ContextManagerClientProfileMutationResult> =
    face.profileMutations.setSkillMode(original, 'main', 'literal/日本語', mode)
  const removed: Promise<ContextManagerClientProfileMutationResult> =
    face.profileMutations.removeSkillBinding(original, 'main', 'literal/日本語')
  void configured
  void removed

  const skillRead: Promise<ContextManagerClientLazyReadResult> =
    model.loadAgentSkillRuntime('exact-agent-id')
  const pinnedRead: Promise<ContextManagerClientLazyReadResult> =
    model.loadAgentPinnedRuntime('exact-agent-id')
  void skillRead
  void pinnedRead

  const exactAgent = 'exact-agent-id'
  const skillState: ContextManagerClientSurface<ContextManagerRemoteSkillRuntimeInspection> | undefined =
    model.state.getSnapshot().diagnostics.skills.get(exactAgent)
  const pinnedState: ContextManagerClientSurface<ContextManagerRemotePinnedSkillInspection> | undefined =
    model.state.getSnapshot().diagnostics.pinned.get(exactAgent)
  void skillState
  void pinnedState
}

// B0 intentionally does NOT assert that the Renderer BusinessFace already
// offers Agent inspection loaders: the two typed Model loaders exist but the
// additive B3 read-only BusinessFace projection is not implemented yet.
// Hard-coding their absence here would break B3's legitimate additive work.
void verifyPublishedClientSkills

const _basis: SkillMutationUsesOriginalBasis = true
const _removeBasis: RemoveUsesOriginalBasis = true
const _setResult: SkillMutationIsOneProfileResult = true
const _removeResult: RemoveIsOneProfileResult = true
void [_basis, _removeBasis, _setResult, _removeResult]
