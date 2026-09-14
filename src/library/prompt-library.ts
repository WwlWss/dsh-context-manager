import { z } from 'zod'

import type { PromptStorageDomainSpec } from '../adapters/storage-domain.js'

export const PROMPT_LIBRARY_DOMAIN_NAME = 'dsh_context_manager_prompts'
export const PROMPT_LIBRARY_TABLE_NAME = 'resources'
export const PROMPT_LIBRARY_DOMAIN_VERSION = 1

export interface PromptResource {
  readonly name: string
  readonly description?: string
  readonly content: string
  readonly revision: number
  readonly [key: string]: unknown
}

/**
 * DSH storage-domain keeps schema.parse(raw) as authoritative in-memory state.
 * passthrough() is therefore required so an older Context Manager build cannot
 * erase unknown future siblings during reopen or a later narrow edit.
 */
export const PROMPT_RESOURCE_SCHEMA: z.ZodType<PromptResource> = z.object({
  name: z.string(),
  description: z.string().optional(),
  content: z.string(),
  revision: z.number().int().positive(),
}).passthrough()

export type PromptResourceId = string

/** A detached Host read model. The record stays nested so a future `id` field cannot collide with its key. */
export interface PromptResourceSnapshot {
  readonly id: PromptResourceId
  readonly resource: Readonly<PromptResource>
}

/** Current structured authoring shape; revision is library-owned. */
export interface PromptResourceInput {
  readonly name: string
  readonly description?: string
  readonly content: string
}

export const PROMPT_RESOURCE_INPUT_SCHEMA: z.ZodType<PromptResourceInput> = z.object({
  name: z.string(),
  description: z.string().optional(),
  content: z.string(),
}).strict()

/** Structural public DomainSpec intersection shared by every supported DSH generation. */
export const PROMPT_LIBRARY_DOMAIN_SPEC = {
  name: PROMPT_LIBRARY_DOMAIN_NAME,
  version: PROMPT_LIBRARY_DOMAIN_VERSION,
  tables: {
    [PROMPT_LIBRARY_TABLE_NAME]: {
      valueSchema: PROMPT_RESOURCE_SCHEMA,
    },
  },
} satisfies PromptStorageDomainSpec<PromptResource>
