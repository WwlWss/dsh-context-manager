import type { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import type { SessionProjectionStateMap } from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-agent-presets'

type Assert<T extends true> = T

type NativeSessions = Context['sessions']
type NativeProjections = Context['sessionProjections']
type NativeAgentPresetState = SessionProjectionStateMap['agentPreset']

type ExactAgentPresetState =
  [NativeAgentPresetState] extends [string | null]
    ? [string | null] extends [NativeAgentPresetState]
      ? true
      : false
    : false

type StableSessionStore = NativeSessions extends {
  get(id: Parameters<NativeSessions['get']>[0]): Session | undefined
}
  ? true
  : false

type StableProjectionRead = NativeProjections extends {
  stateOf(session: Session, key: 'agentPreset'): unknown
}
  ? true
  : false

type StableModernEvents = Session extends {
  snapshotEvents(...args: unknown[]): readonly unknown[]
}
  ? true
  : false

type _AssertSessionStore = Assert<StableSessionStore>
type _AssertProjectionRead = Assert<StableProjectionRead>
type _AssertAgentPresetState = Assert<ExactAgentPresetState>
type _AssertModernEvents = Assert<StableModernEvents>

export {}
