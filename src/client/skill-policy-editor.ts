import type {
  ContextManagerRemoteProfile, ContextManagerRemoteSkillBinding,
  ContextManagerRemoteSkillMode,
} from '../remote/types.js'
import type { ContextManagerClientSnapshot } from './model-types.js'
import type {
  ContextManagerClientProfileMutationBasis,
  ContextManagerClientProfileMutationResult,
  ContextManagerClientProfileMutations,
} from './mutation-types.js'
import { isProfileBeginCurrent } from './profile-view.js'
import { noticeForMutationResult } from './profile-editor.js'
import type { ProfileDraft, ProfileDraftBlock, ProfileNotice, SkillDraft } from './profile-editor.js'

/** Skill bindings occupy the existing shared Profile Draft slot.
 * This type check must NEVER recognize an M7C Profile or M8A2 Binding draft. */
export function isSkillDraft(draft: ProfileDraft | null): draft is SkillDraft {
  return draft !== null && (
    draft.kind === 'skill-mode-create'
    || draft.kind === 'skill-mode-edit'
    || draft.kind === 'skill-binding-delete'
  )
}

/** A read-only projection of explicitly configured OWN Skill entries.
 * Native catalog resolution, Agent effectiveness and unknown Stored siblings
 * are not represented in this projected object. No locale sorting/normalizing. */
export function sortedSkillBindings(
  profile: ContextManagerRemoteProfile,
): [string, ContextManagerRemoteSkillBinding][] {
  return Object.entries(profile.skills).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  )
}

/** DSH Settings rejects only the prototype mutation path segment. Empty
 * strings, whitespace, Unicode and other prototype-named strings are valid. */
export function isWritableSkillPath(profileId: string, skillName?: string): boolean {
  return profileId !== '__proto__' && skillName !== '__proto__'
}

/** Begin must preserve *rendered* Profile and existing Skill identity. The
 * live Model supplies fresh Basis, whereas this snapshot is owned by the
 * original React render. A Resource-only generation change is irrelevant. */
export function isSkillBeginCurrent(
  snapshot: ContextManagerClientSnapshot,
  profileId: string,
  renderedProfile: ContextManagerRemoteProfile,
  basis: ContextManagerClientProfileMutationBasis | undefined,
  target?: {
    skillName: string
    renderedBinding: ContextManagerRemoteSkillBinding
    originalMode: ContextManagerRemoteSkillMode
  },
): boolean {
  if (!isWritableSkillPath(profileId, target?.skillName)
    || !isProfileBeginCurrent(snapshot, basis)) return false
  const profiles = snapshot.profiles.data?.profiles
  if (profiles === undefined
    || !Object.hasOwn(profiles, profileId)
    || profiles[profileId] !== renderedProfile) return false
  if (target === undefined) return true
  return Object.hasOwn(renderedProfile.skills, target.skillName)
    && renderedProfile.skills[target.skillName] === target.renderedBinding
    && target.renderedBinding.mode === target.originalMode
}

/** Configure intent is different from Edit, explicit Auto and absent Binding.
 * The own keys observed at Begin are copied/frozen by the real Store action. */
export function validateSkillCreate(
  draft: Extract<SkillDraft, { kind: 'skill-mode-create' }>,
): 'valid' | 'unsafe-id' | 'exists' {
  if (!isWritableSkillPath(draft.profileId, draft.skillName)) return 'unsafe-id'
  return draft.observedSkillNames.includes(draft.skillName) ? 'exists' : 'valid'
}

export function skillModeEditChanged(
  draft: Extract<SkillDraft, { kind: 'skill-mode-edit' }>,
): boolean {
  return draft.mode !== draft.originalMode
}

/** ONE existing Profile RPC per explicit valid Save. No Host authority
 * recapture; call-site must first win the current root Store submission claim.
 * Explicit Auto Create is a real write, whereas unchanged Edit is a no-op. */
export function commitSkillDraft(
  draft: SkillDraft,
  api: ContextManagerClientProfileMutations,
): Promise<ContextManagerClientProfileMutationResult> | undefined {
  if (!isWritableSkillPath(draft.profileId, draft.skillName)) return undefined
  switch (draft.kind) {
    case 'skill-mode-create':
      return validateSkillCreate(draft) === 'valid'
        ? api.setSkillMode(draft.basis, draft.profileId, draft.skillName, draft.mode)
        : undefined
    case 'skill-mode-edit':
      return skillModeEditChanged(draft)
        ? api.setSkillMode(draft.basis, draft.profileId, draft.skillName, draft.mode)
        : undefined
    case 'skill-binding-delete':
      return api.removeSkillBinding(draft.basis, draft.profileId, draft.skillName)
  }
}

/** First terminal states remain distinct: confirmed-but-degraded is not
 * Unknown; missing bindings/Profiles cannot be silently recreated. */
export function blockForSkillResult(
  result: ContextManagerClientProfileMutationResult,
): ProfileDraftBlock | undefined {
  switch (result.status) {
    case 'applied': return result.refresh === 'degraded' ? 'unverified' : undefined
    case 'unknown': return 'unknown'
    case 'detached':
    case 'disposed':
    case 'incompatible':
    case 'superseded': return 'stale'
    case 'rejected':
      if (result.error.kind === 'precondition') {
        return result.error.code === 'profile-basis-unavailable'
          || result.error.code === 'profile-basis-stale' ? 'stale' : undefined
      }
      if (result.error.code === 'profile-conflict'
        || result.error.code === 'host-instance-conflict') return 'conflict'
      if (result.error.code === 'profile-not-found'
        || result.error.code === 'skill-binding-not-found'
        || result.error.code === 'profile-path-not-editable'
        || result.error.code === 'persistence-document-invalid') return 'stale'
      return undefined
  }
}

export function noticeForSkillResult(
  result: ContextManagerClientProfileMutationResult,
): ProfileNotice | undefined {
  if (result.status === 'rejected' && result.error.kind === 'business') {
    const error = result.error
    if (error.code === 'skill-binding-not-found' || error.code === 'profile-not-found') {
      return { code: 'noticeSkillMissing', kind: 'warning', detail: error.message }
    }
    if (error.code === 'invalid-skill-mode' || error.code === 'unsafe-path-key') {
      return { code: 'noticeInvalidInput', kind: 'error', detail: error.message }
    }
  }
  return noticeForMutationResult(result)
}
