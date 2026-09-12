import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent-presets'

type Assert<T extends true> = T

type NativeAgentPresets = Context['agentPresets']
type NativeRoster = Awaited<ReturnType<NativeAgentPresets['list']>>
type NativeRow = NativeRoster[number]
type NativeTrust = NativeRow['trust']
type NativeRead = NativeAgentPresets['read']
type NativeCopy = NativeAgentPresets['copy']
type NativeRemove = NativeAgentPresets['remove']

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

// M3C consumes the exact input shape and asynchronous completion boundary of
// each Host operation. It deliberately does not consume copy/remove success
// payloads, so a future DSH version may enrich those return values without
// becoming incompatible with Context Manager.
type StableReadHost = NativeRead extends (id: string) => Promise<string>
  ? true
  : false

type StableCopyHost = NativeCopy extends (
  from: string,
  id: string,
  name?: string,
) => Promise<unknown>
  ? true
  : false

type StableRemoveHost = NativeRemove extends (id: string) => Promise<unknown>
  ? true
  : false

type _AssertPresetTrust = Assert<ExactPresetTrust>
type _AssertRosterRow = Assert<StableRosterRow>
type _AssertHostService = Assert<StableHostService>
type _AssertReadHost = Assert<StableReadHost>
type _AssertCopyHost = Assert<StableCopyHost>
type _AssertRemoveHost = Assert<StableRemoveHost>

export {}
