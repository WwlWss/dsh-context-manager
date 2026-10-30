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

/** B2-B1 authorization gate: *no* Skill mutation is dispatched during
 * B2-A1/A2. Actual writes require a separately evidenced mounted Save,
 * live owner, first receipt and Host CAS validation. */
export function commitSkillDraft(
  _draft: SkillDraft,
  _api: ContextManagerClientProfileMutations,
): Promise<ContextManagerClientProfileMutationResult> | undefined {
  return undefined
}

/** Result behavior remains an independent B2-B1 RED. */
export function blockForSkillResult(
  _result: ContextManagerClientProfileMutationResult,
): ProfileDraftBlock | undefined {
  return undefined
}

export function noticeForSkillResult(
  _result: ContextManagerClientProfileMutationResult,
): ProfileNotice | undefined {
  return undefined
}
