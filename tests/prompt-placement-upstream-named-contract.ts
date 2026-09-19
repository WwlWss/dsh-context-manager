import type { Context } from '@deepseek-ai/cordis'
import type {
  AssembleContext,
  PromptContext,
  PromptContextOrderName,
  PromptSection,
  PromptSectionOrderName,
} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-system-prompt'

type Assert<T extends true> = T

type NativeSystemPrompt = Context['systemPrompt']

type StableRegistrationSurface = NativeSystemPrompt extends {
  section(section: PromptSection): () => void
  context(context: PromptContext): () => void
  suppressRuntimeContext(): () => void
  assemble(context?: AssembleContext): Promise<unknown>
  getSectionOrder(name: PromptSectionOrderName): number
  getContextOrder(name: PromptContextOrderName): number
}
  ? true
  : false

type HasToolBash =
  'TOOL_BASH' extends PromptSectionOrderName ? true : false
type HasToolsSdk =
  'TOOLS_SDK' extends PromptSectionOrderName ? true : false
type HasSubagentDelegation =
  'SUBAGENT_DELEGATION' extends PromptContextOrderName ? true : false

type _AssertRegistrationSurface = Assert<StableRegistrationSurface>
type _AssertToolBash = Assert<HasToolBash>
type _AssertToolsSdk = Assert<HasToolsSdk>
type _AssertSubagentDelegation = Assert<HasSubagentDelegation>

export {}
