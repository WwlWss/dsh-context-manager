import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent-presets'

type Assert<T extends true> = T

type NativeAgentPresets = Context['agentPresets']
type NativeRoster = Awaited<ReturnType<NativeAgentPresets['list']>>
type NativeRow = NativeRoster[number]
type NativeTrust = NativeRow['trust']

type ExactPresetTrust =
  [NativeTrust] extends ['system' | 'user']
    ? ['system' | 'user'] extends [NativeTrust]
      ? true
      : false
    : false

type StableRosterRow = NativeRow extends {
  readonly id: string
  readonly trust: 'system' | 'user'
  readonly name?: string
  readonly description?: string
  readonly broken?: string
}
  ? true
  : false

type StableHostService = NativeAgentPresets extends {
  readonly defaultId: string
  readonly authorable: boolean
  list(): Promise<readonly unknown[]>
}
  ? true
  : false

type _AssertPresetTrust = Assert<ExactPresetTrust>
type _AssertRosterRow = Assert<StableRosterRow>
type _AssertHostService = Assert<StableHostService>

export {}
