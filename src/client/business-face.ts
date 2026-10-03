import type { ContextManagerClientModel } from './model.js'
import type { ContextManagerClientReconcileResult } from './model-types.js'
import type {
  ContextManagerClientProfileMutationBasis,
  ContextManagerClientProfileMutations,
} from './mutation-types.js'

export type ContextManagerClientBusinessSource = Pick<
  ContextManagerClientModel,
  'state' | 'mutations' | 'refresh' | 'captureProfileMutationBasis'
>

export interface ContextManagerClientBusinessFace {
  readonly hooks: {
    readonly contextManager: ContextManagerClientBusinessSource['state']
    readonly profileMutation: ContextManagerClientBusinessSource['mutations']['state']
  }
  readonly refresh: () => Promise<ContextManagerClientReconcileResult>
  readonly captureProfileMutationBasis:
    () => ContextManagerClientProfileMutationBasis | undefined
  readonly profileMutations: ContextManagerClientProfileMutations
}

export function createContextManagerClientBusinessFace(
  source: ContextManagerClientBusinessSource,
): ContextManagerClientBusinessFace {
  const profileMutations = Object.freeze({
    createProfile: (
      ...args: Parameters<ContextManagerClientProfileMutations['createProfile']>
    ) => source.mutations.createProfile(...args),
    deleteProfile: (
      ...args: Parameters<ContextManagerClientProfileMutations['deleteProfile']>
    ) => source.mutations.deleteProfile(...args),
    setDefaultProfile: (
      ...args: Parameters<ContextManagerClientProfileMutations['setDefaultProfile']>
    ) => source.mutations.setDefaultProfile(...args),
    setProfileName: (
      ...args: Parameters<ContextManagerClientProfileMutations['setProfileName']>
    ) => source.mutations.setProfileName(...args),
    setProfileDescription: (
      ...args: Parameters<ContextManagerClientProfileMutations['setProfileDescription']>
    ) => source.mutations.setProfileDescription(...args),
    setProfileBasePreset: (
      ...args: Parameters<ContextManagerClientProfileMutations['setProfileBasePreset']>
    ) => source.mutations.setProfileBasePreset(...args),
    setSkillMode: (
      ...args: Parameters<ContextManagerClientProfileMutations['setSkillMode']>
    ) => source.mutations.setSkillMode(...args),
    removeSkillBinding: (
      ...args: Parameters<ContextManagerClientProfileMutations['removeSkillBinding']>
    ) => source.mutations.removeSkillBinding(...args),
    addPromptBinding: (
      ...args: Parameters<ContextManagerClientProfileMutations['addPromptBinding']>
    ) => source.mutations.addPromptBinding(...args),
    setPromptBindingResourceId: (
      ...args: Parameters<ContextManagerClientProfileMutations['setPromptBindingResourceId']>
    ) => source.mutations.setPromptBindingResourceId(...args),
    setPromptBindingEnabled: (
      ...args: Parameters<ContextManagerClientProfileMutations['setPromptBindingEnabled']>
    ) => source.mutations.setPromptBindingEnabled(...args),
    setPromptBindingPlacement: (
      ...args: Parameters<ContextManagerClientProfileMutations['setPromptBindingPlacement']>
    ) => source.mutations.setPromptBindingPlacement(...args),
    setPromptBindingOrder: (
      ...args: Parameters<ContextManagerClientProfileMutations['setPromptBindingOrder']>
    ) => source.mutations.setPromptBindingOrder(...args),
    removePromptBinding: (
      ...args: Parameters<ContextManagerClientProfileMutations['removePromptBinding']>
    ) => source.mutations.removePromptBinding(...args),
  } satisfies ContextManagerClientProfileMutations)

  return Object.freeze({
    hooks: Object.freeze({
      contextManager: source.state,
      profileMutation: source.mutations.state,
    }),
    refresh: () => source.refresh(),
    captureProfileMutationBasis: () => source.captureProfileMutationBasis(),
    profileMutations,
  })
}
