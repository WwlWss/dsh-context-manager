import type {
  ContextProfile,
  SkillMode,
} from '../domain/model.js'

export interface ManagedSkillInvocationPolicy {
  readonly modelInvocable: boolean
  readonly userInvocable: boolean
}

/**
 * Return the native invocation override for one Context Manager mode.
 *
 * Auto is deliberately represented by undefined: preserving the native
 * winning policy is different from forcing both invocation surfaces on.
 */
export function managedSkillInvocationPolicy(
  mode: SkillMode | undefined,
): ManagedSkillInvocationPolicy | undefined {
  switch (mode) {
    case 'manual':
      return Object.freeze({
        modelInvocable: false,
        userInvocable: true,
      })
    case 'off':
    case 'pinned':
      return Object.freeze({
        modelInvocable: false,
        userInvocable: false,
      })
    case 'auto':
    case undefined:
      return undefined
  }
}

/** Read one current binding mode without inventing a missing binding. */
export function profileSkillMode(
  profile: ContextProfile,
  skillName: string,
): SkillMode | undefined {
  return profile.skills[skillName]?.mode
}

/**
 * Deterministic code-unit order shared by provider discovery, inspection, and
 * later M5C Pinned rendering unless bindings gain an explicit order field.
 */
export function compareSkillNames(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

/** Sorted profile bindings without mutating the frozen Domain object. */
export function sortedProfileSkillBindings(
  profile: ContextProfile,
): readonly Readonly<[string, SkillMode]>[] {
  return Object.freeze(
    Object.entries(profile.skills)
      .map(([name, binding]) => Object.freeze([name, binding.mode] as const))
      .sort(([left], [right]) => compareSkillNames(left, right)),
  )
}
