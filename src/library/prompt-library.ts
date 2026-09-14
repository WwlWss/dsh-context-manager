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

interface ParseSchema<T> {
  parse(value: unknown): T
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a string`)
  return value
}

/**
 * DSH storage-domain keeps schema.parse(raw) as authoritative in-memory state.
 * This parser therefore validates only fields M4A owns and returns the exact
 * record object, preserving every unknown future sibling without normalization.
 */
export const PROMPT_RESOURCE_SCHEMA: ParseSchema<PromptResource> = {
  parse(value: unknown): PromptResource {
    const record = requireRecord(value, 'prompt resource')
    requireString(record.name, 'prompt resource.name')
    requireString(record.content, 'prompt resource.content')
    if (record.description !== undefined) {
      requireString(record.description, 'prompt resource.description')
    }
    if (!Number.isInteger(record.revision) || Number(record.revision) < 1) {
      throw new TypeError('prompt resource.revision must be a positive integer')
    }
    return record as PromptResource
  },
}

export const PROMPT_RESOURCE_INPUT_SCHEMA: ParseSchema<PromptResourceInput> = {
  parse(value: unknown): PromptResourceInput {
    const record = requireRecord(value, 'prompt resource input')
    const allowed = new Set(['name', 'description', 'content'])
    for (const key of Object.keys(record)) {
      if (!allowed.has(key)) {
        throw new TypeError(`prompt resource input contains unknown field ${JSON.stringify(key)}`)
      }
    }
    const name = requireString(record.name, 'prompt resource input.name')
    const content = requireString(record.content, 'prompt resource input.content')
    if (record.description === undefined) return { name, content }
    return {
      name,
      description: requireString(record.description, 'prompt resource input.description'),
      content,
    }
  },
}

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
