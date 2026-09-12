import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEventMap } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent-presets'

type Assert<T extends true> = T

type NativeSessions = Context['sessions']
type SelectedEvent = SessionEventMap['agent-preset/selected']

type StableSessionStore = NativeSessions extends {
  get(id: Parameters<NativeSessions['get']>[0]): Session | undefined
}
  ? true
  : false

type StableSessionHeader = Session['header'] extends {
  readonly agentPreset?: string
}
  ? true
  : false

type StableLegacyEvents = Session extends {
  readonly events: readonly unknown[]
}
  ? true
  : false

type StableSelectionEvent = SelectedEvent extends {
  agentPreset: string
}
  ? true
  : false

type _AssertSessionStore = Assert<StableSessionStore>
type _AssertSessionHeader = Assert<StableSessionHeader>
type _AssertLegacyEvents = Assert<StableLegacyEvents>
type _AssertSelectionEvent = Assert<StableSelectionEvent>

export {}
