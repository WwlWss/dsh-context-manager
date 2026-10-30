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
import type { ProfileDraft, ProfileDraftBlock, ProfileNotice, SkillDraft } from './profile-editor.js'

/**
 * B1-2b intentionally INERT executable-RED seams. These functions are
 * imported by the B1-2b test bundle, NOT by the published Skill editor
 * (which does not exist yet). Every behavior return is deliberately
 * unimplemented until independently qualified B2 GREEN. An import error
 * or TypeScript failure is not accepted as a RED.
 */
export function isSkillDraft(_draft: ProfileDraft | null): _draft is SkillDraft {
  return false
}

export function sortedSkillBindings(
  _profile: ContextManagerRemoteProfile,
): [string, ContextManagerRemoteSkillBinding][] {
  return []
}

export function isWritableSkillPath(_profileId: string, _skillName?: string): boolean {
  return false
}

export function isSkillBeginCurrent(
  _snapshot: ContextManagerClientSnapshot,
  _profileId: string,
  _renderedProfile: ContextManagerRemoteProfile,
  _basis: ContextManagerClientProfileMutationBasis | undefined,
  _target?: {
    skillName: string
    renderedBinding: ContextManagerRemoteSkillBinding
    originalMode: ContextManagerRemoteSkillMode
  },
): boolean {
  return false
}

export function validateSkillCreate(
  _draft: Extract<SkillDraft, { kind: 'skill-mode-create' }>,
): 'valid' | 'unsafe-id' | 'exists' {
  return 'unsafe-id'
}

export function skillModeEditChanged(
  _draft: Extract<SkillDraft, { kind: 'skill-mode-edit' }>,
): boolean {
  return false
}

export function commitSkillDraft(
  _draft: SkillDraft,
  _api: ContextManagerClientProfileMutations,
): Promise<ContextManagerClientProfileMutationResult> | undefined {
  return undefined
}

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
