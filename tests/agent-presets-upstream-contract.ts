import type {
  AgentPreset,
  AgentPresets,
  PresetTrust,
} from '@deepseek-ai/dsh-agent-presets'

type Assert<T extends true> = T

type ExactPresetTrust =
  [PresetTrust] extends ['system' | 'user']
    ? ['system' | 'user'] extends [PresetTrust]
      ? true
      : false
    : false

type StableRosterRow = AgentPreset extends {
  readonly id: string
  readonly trust: 'system' | 'user'
  readonly name?: string
  readonly description?: string
  readonly broken?: string
}
  ? true
  : false

type StableHostService = AgentPresets extends {
  readonly defaultId: string
  readonly authorable: boolean
  list(): Promise<readonly AgentPreset[]>
}
  ? true
  : false

type _AssertPresetTrust = Assert<ExactPresetTrust>
type _AssertRosterRow = Assert<StableRosterRow>
type _AssertHostService = Assert<StableHostService>

export {}
