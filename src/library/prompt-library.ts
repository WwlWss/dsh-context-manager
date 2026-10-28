import { z } from 'zod'

import type { PromptStorageDomainSpec } from '../adapters/storage-domain.js'

export const PROMPT_LIBRARY_DOMAIN_NAME = 'dsh_context_manager_prompts'
export const PROMPT_LIBRARY_TABLE_NAME = 'resources'
export const PROMPT_LIBRARY_DOMAIN_VERSION = 1
// Reserved Host-owned field, never user-settable through structured authoring.
export const PROMPT_RESOURCE_INCARNATION_FIELD = '__dshCmResourceIncarnation'
export type StoredPromptPayload = unknown

export interface PromptResource {
  readonly name: string
  readonly description?: string
  readonly content: string
  readonly revision: number
  readonly [PROMPT_RESOURCE_INCARNATION_FIELD]?: string
  readonly [key: string]: unknown
}

export const PROMPT_RESOURCE_SCHEMA: z.ZodType<PromptResource> = z.object({
  name: z.string(),
  description: z.string().optional(),
  content: z.string(),
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  [PROMPT_RESOURCE_INCARNATION_FIELD]: z.string().uuid().optional(),
}).passthrough()

export type PromptResourceId = string

export interface PromptResourceCreateBasis {
  readonly resourceAuthorityId: string
}

export interface PromptResourceMutationBasis extends PromptResourceCreateBasis {
  readonly resourceId: PromptResourceId
  readonly incarnationId: string | null
  readonly revision: number
}

export interface PromptResourceSnapshot {
  readonly id: PromptResourceId
  readonly resource: Readonly<PromptResource>
}

export interface UsablePromptResourceSummary {
  readonly status: 'usable'
  readonly id: PromptResourceId
  readonly name: string
  readonly description?: string
  readonly revision: number
  readonly incarnationId: string | null
}

export interface InvalidPromptResourceSummary {
  readonly status: 'invalid'
  readonly id: PromptResourceId
  readonly message: string
}

export type PromptResourceListItem = UsablePromptResourceSummary | InvalidPromptResourceSummary

export interface PromptMutationReceipt {
  readonly id: PromptResourceId
  readonly revision: number
}

export interface PromptResourceInput {
  readonly name: string
  readonly description?: string
  readonly content: string
  readonly [key: string]: unknown
}

export const PROMPT_RESOURCE_INPUT_SCHEMA: z.ZodType<PromptResourceInput> = z.object({
  name: z.string(),
  description: z.string().optional(),
  content: z.string(),
}).passthrough()

export const PROMPT_STORED_PAYLOAD_SCHEMA: z.ZodType<StoredPromptPayload> = z.unknown()

export const PROMPT_LIBRARY_DOMAIN_SPEC = {
  name: PROMPT_LIBRARY_DOMAIN_NAME,
  version: PROMPT_LIBRARY_DOMAIN_VERSION,
  tables: {
    [PROMPT_LIBRARY_TABLE_NAME]: {
      valueSchema: PROMPT_STORED_PAYLOAD_SCHEMA,
    },
  },
} satisfies PromptStorageDomainSpec<StoredPromptPayload>
