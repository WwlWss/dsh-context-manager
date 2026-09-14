import { Context, Service } from '@deepseek-ai/cordis'

import {
  openPromptStorage,
  type PromptStorageTable,
} from '../adapters/storage-domain.js'
import { ContextManagerError } from '../domain/errors.js'
import {
  PROMPT_LIBRARY_DOMAIN_SPEC,
  PROMPT_LIBRARY_TABLE_NAME,
  PROMPT_RESOURCE_INPUT_SCHEMA,
  type PromptResource,
  type PromptResourceId,
  type PromptResourceInput,
  type PromptResourceSnapshot,
} from '../library/prompt-library.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    dshContextPromptLibrary: ContextManagerPromptLibrary
  }
}

function invalidPromptResource(error: unknown): ContextManagerError {
  return new ContextManagerError(
    'invalid-prompt-resource',
    error instanceof Error ? error.message : String(error),
  )
}

function snapshotOf(id: PromptResourceId, resource: PromptResource): PromptResourceSnapshot {
  return Object.freeze({
    id,
    resource: Object.freeze(structuredClone(resource)),
  })
}

/**
 * Durable, model-inert prompt body library over DSH storage-domain.
 * M4A owns no PromptBinding and registers nothing with systemPrompt.
 */
export class ContextManagerPromptLibrary extends Service {
  static inject = ['storageDomain']

  private table?: PromptStorageTable<PromptResourceId, PromptResource>
  private operationTail: Promise<void> = Promise.resolve()

  constructor(ctx: Context) {
    super(ctx, 'dshContextPromptLibrary')
  }

  protected async [Service.init](): Promise<void> {
    const storage = await openPromptStorage<PromptResourceId, PromptResource>(
      this.ctx,
      PROMPT_LIBRARY_DOMAIN_SPEC,
      PROMPT_LIBRARY_TABLE_NAME,
    )
    this.table = storage.table
    this.ctx.effect(() => async () => {
      this.table = undefined
      await storage.close()
    }, 'dshContextPromptLibrary.domainClose')
  }

  list(): readonly PromptResourceSnapshot[] {
    return Object.freeze(
      [...this.requireTable().entries()].map(([id, resource]) => snapshotOf(id, resource)),
    )
  }

  get(id: PromptResourceId): PromptResourceSnapshot {
    return snapshotOf(id, this.requireResource(id))
  }

  async createPrompt(
    id: PromptResourceId,
    input: PromptResourceInput,
  ): Promise<PromptResourceSnapshot> {
    if (typeof id !== 'string') throw invalidPromptResource(new TypeError('prompt resource id must be a string'))
    const parsed = this.parseInput(input)
    return await this.enqueueOperation(async () => {
      const table = this.requireTable()
      if (table.get(id) !== undefined) {
        throw new ContextManagerError(
          'prompt-resource-exists',
          `prompt resource ${JSON.stringify(id)} already exists`,
        )
      }
      const resource: PromptResource = { ...parsed, revision: 1 }
      await table.put(id, resource)
      return snapshotOf(id, resource)
    })
  }

  async replacePrompt(
    id: PromptResourceId,
    input: PromptResourceInput,
    expectedRevision: number,
  ): Promise<PromptResourceSnapshot> {
    const parsed = this.parseInput(input)
    return await this.updateResource(id, expectedRevision, (current) => {
      const { description: _previousDescription, ...rest } = current
      return parsed.description === undefined
        ? {
            ...rest,
            name: parsed.name,
            content: parsed.content,
            revision: current.revision + 1,
          }
        : {
            ...rest,
            name: parsed.name,
            description: parsed.description,
            content: parsed.content,
            revision: current.revision + 1,
          }
    })
  }

  async setPromptName(
    id: PromptResourceId,
    name: string,
    expectedRevision: number,
  ): Promise<PromptResourceSnapshot> {
    if (typeof name !== 'string') throw invalidPromptResource(new TypeError('prompt name must be a string'))
    return await this.updateResource(id, expectedRevision, current => ({
      ...current,
      name,
      revision: current.revision + 1,
    }))
  }

  async setPromptDescription(
    id: PromptResourceId,
    description: string | undefined,
    expectedRevision: number,
  ): Promise<PromptResourceSnapshot> {
    if (description !== undefined && typeof description !== 'string') {
      throw invalidPromptResource(new TypeError('prompt description must be a string when present'))
    }
    return await this.updateResource(id, expectedRevision, (current) => {
      const { description: _previousDescription, ...rest } = current
      return description === undefined
        ? { ...rest, revision: current.revision + 1 }
        : { ...rest, description, revision: current.revision + 1 }
    })
  }

  async setPromptContent(
    id: PromptResourceId,
    content: string,
    expectedRevision: number,
  ): Promise<PromptResourceSnapshot> {
    if (typeof content !== 'string') throw invalidPromptResource(new TypeError('prompt content must be a string'))
    return await this.updateResource(id, expectedRevision, current => ({
      ...current,
      content,
      revision: current.revision + 1,
    }))
  }

  async deletePrompt(id: PromptResourceId, expectedRevision: number): Promise<void> {
    await this.enqueueOperation(async () => {
      const table = this.requireTable()
      const current = table.get(id)
      if (current === undefined) throw this.notFound(id)
      this.assertRevision(id, current, expectedRevision)
      const deleted = await table.delete(id)
      if (!deleted) throw this.notFound(id)
    })
  }

  private parseInput(input: PromptResourceInput): PromptResourceInput {
    try {
      return PROMPT_RESOURCE_INPUT_SCHEMA.parse(input)
    } catch (error) {
      throw invalidPromptResource(error)
    }
  }

  private requireTable(): PromptStorageTable<PromptResourceId, PromptResource> {
    if (this.table === undefined) {
      throw new ContextManagerError(
        'prompt-library-not-ready',
        'Context Manager prompt library storage is not ready',
      )
    }
    return this.table
  }

  private requireResource(id: PromptResourceId): PromptResource {
    const resource = this.requireTable().get(id)
    if (resource === undefined) throw this.notFound(id)
    return resource
  }

  private notFound(id: PromptResourceId): ContextManagerError {
    return new ContextManagerError(
      'prompt-resource-not-found',
      `prompt resource ${JSON.stringify(id)} does not exist`,
    )
  }

  private assertRevision(
    id: PromptResourceId,
    current: PromptResource,
    expectedRevision: number,
  ): void {
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      throw new ContextManagerError(
        'invalid-prompt-resource',
        `expected revision for prompt resource ${JSON.stringify(id)} must be a positive integer`,
      )
    }
    if (current.revision !== expectedRevision) {
      throw new ContextManagerError(
        'prompt-resource-conflict',
        `prompt resource ${JSON.stringify(id)} revision conflict: expected ${String(expectedRevision)}, current ${String(current.revision)}`,
      )
    }
  }

  private async updateResource(
    id: PromptResourceId,
    expectedRevision: number,
    update: (current: PromptResource) => PromptResource,
  ): Promise<PromptResourceSnapshot> {
    const table = this.requireTable()
    if (table.get(id) === undefined) throw this.notFound(id)
    const next = await table.update(id, (current) => {
      this.assertRevision(id, current, expectedRevision)
      return update(current)
    })
    return snapshotOf(id, next)
  }

  private enqueueOperation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(operation, operation)
    this.operationTail = result.then(() => {}, () => {})
    return result
  }
}
