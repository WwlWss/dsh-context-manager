import type { Context } from '@deepseek-ai/cordis'
import type {
  AssembleContext,
  PromptContext,
  PromptSection,
} from '@deepseek-ai/dsh-system-prompt'
import {
  PERSONA_ORDER,
} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-system-prompt'

type Assert<T extends true> = T

type NativeSystemPrompt = Context['systemPrompt']

type StableRegistrationSurface = NativeSystemPrompt extends {
  section(section: PromptSection): () => void
  context(context: PromptContext): () => void
  suppressRuntimeContext(): () => void
  assemble(context?: AssembleContext): Promise<unknown>
}
  ? true
  : false

type NoNamedSectionOrder =
  'getSectionOrder' extends keyof NativeSystemPrompt ? false : true

type NoNamedContextOrder =
  'getContextOrder' extends keyof NativeSystemPrompt ? false : true

type LegacyPersonaOrder = typeof PERSONA_ORDER extends 0 ? true : false

type _AssertRegistrationSurface = Assert<StableRegistrationSurface>
type _AssertNoNamedSectionOrder = Assert<NoNamedSectionOrder>
type _AssertNoNamedContextOrder = Assert<NoNamedContextOrder>
type _AssertPersonaOrder = Assert<LegacyPersonaOrder>

export {}
