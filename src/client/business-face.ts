import type { ContextManagerClientModel } from './model.js'
import type { ContextManagerClientReconcileResult } from './model-types.js'
import type {
  ContextManagerClientProfileMutationBasis,
  ContextManagerClientProfileMutations,
} from './mutation-types.js'
import type { ContextManagerClientResourceMutations } from './resource-mutation-types.js'

export type ContextManagerClientBusinessSource = Pick<
  ContextManagerClientModel,
  | 'state'
  | 'mutations'
  | 'resourceMutations'
  | 'refresh'
  | 'captureProfileMutationBasis'
  | 'capturePromptResourceCreateBasis'
  | 'capturePromptResourceReadStamp'
  | 'loadPromptResourceList'
  | 'loadPromptResource'
>

export interface ContextManagerClientBusinessFace {
  readonly hooks: {
    readonly contextManager: ContextManagerClientBusinessSource['state']
    readonly profileMutation: ContextManagerClientBusinessSource['mutations']['state']
    readonly resourceMutation: ContextManagerClientBusinessSource['resourceMutations']['state']
  }
  readonly refresh: () => Promise<ContextManagerClientReconcileResult>
  readonly captureProfileMutationBasis:
    () => ContextManagerClientProfileMutationBasis | undefined
  readonly capturePromptResourceCreateBasis:
    ContextManagerClientBusinessSource['capturePromptResourceCreateBasis']
  readonly capturePromptResourceReadStamp:
    ContextManagerClientBusinessSource['capturePromptResourceReadStamp']
  readonly loadPromptResourceList: ContextManagerClientBusinessSource['loadPromptResourceList']
  readonly loadPromptResource: ContextManagerClientBusinessSource['loadPromptResource']
  readonly profileMutations: ContextManagerClientProfileMutations
  readonly resourceMutations: ContextManagerClientResourceMutations
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

  // Explicit six-method projection. The Controller's internal state/epoch,
  // attach, dispose and reset never cross the renderer business boundary.
  const resourceMutations = Object.freeze({
    createPromptResource: (
      ...args: Parameters<ContextManagerClientResourceMutations['createPromptResource']>
    ) => source.resourceMutations.createPromptResource(...args),
    replacePromptResource: (
      ...args: Parameters<ContextManagerClientResourceMutations['replacePromptResource']>
    ) => source.resourceMutations.replacePromptResource(...args),
    deletePromptResource: (
      ...args: Parameters<ContextManagerClientResourceMutations['deletePromptResource']>
    ) => source.resourceMutations.deletePromptResource(...args),
    setPromptResourceName: (
      ...args: Parameters<ContextManagerClientResourceMutations['setPromptResourceName']>
    ) => source.resourceMutations.setPromptResourceName(...args),
    setPromptResourceDescription: (
      ...args: Parameters<ContextManagerClientResourceMutations['setPromptResourceDescription']>
    ) => source.resourceMutations.setPromptResourceDescription(...args),
    setPromptResourceContent: (
      ...args: Parameters<ContextManagerClientResourceMutations['setPromptResourceContent']>
    ) => source.resourceMutations.setPromptResourceContent(...args),
  } satisfies ContextManagerClientResourceMutations)

  return Object.freeze({
    hooks: Object.freeze({
      contextManager: source.state,
      profileMutation: source.mutations.state,
      resourceMutation: source.resourceMutations.state,
    }),
    refresh: () => source.refresh(),
    captureProfileMutationBasis: () => source.captureProfileMutationBasis(),
    capturePromptResourceCreateBasis: () => source.capturePromptResourceCreateBasis(),
    capturePromptResourceReadStamp: (id, from) => source.capturePromptResourceReadStamp(id, from),
    loadPromptResourceList: () => source.loadPromptResourceList(),
    loadPromptResource: id => source.loadPromptResource(id),
    profileMutations,
    resourceMutations,
  } satisfies ContextManagerClientBusinessFace)
}
