import { Service, type Context } from '@deepseek-ai/cordis'

import { openPromptStorage, type PromptStorageTable } from '../adapters/storage-domain.js'
import { ContextManagerError } from '../domain/errors.js'
import { assertJsonDataShape, isPlainObject } from '../domain/storage.js'
import {
  PROMPT_LIBRARY_DOMAIN_SPEC,
  PROMPT_LIBRARY_TABLE_NAME,
  PROMPT_RESOURCE_INPUT_SCHEMA,
  PROMPT_RESOURCE_SCHEMA,
  type PromptMutationReceipt,
  type PromptResource,
  type PromptResourceId,
  type PromptResourceInput,
  type PromptResourceListItem,
  type PromptResourceSnapshot,
  type StoredPromptPayload,
} from '../library/prompt-library.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    dshContextPromptLibrary: ContextManagerPromptLibrary
  }
}

function invalidPromptResource(error: unknown): ContextManagerError {
  return new ContextManagerError('invalid-prompt-resource', error instanceof Error ? error.message : String(error))
}

function snapshotOf(id: PromptResourceId, resource: PromptResource): PromptResourceSnapshot {
  return Object.freeze({ id, resource: Object.freeze(structuredClone(resource)) })
}

function receiptOf(id: PromptResourceId, revision: number): PromptMutationReceipt {
  return Object.freeze({ id, revision })
}

export class ContextManagerPromptLibrary extends Service {
  static inject = ['storageDomain']

  private table?: PromptStorageTable<PromptResourceId, StoredPromptPayload>
  private operationTail: Promise<void> = Promise.resolve()

  constructor(ctx: Context) {
    super(ctx, 'dshContextPromptLibrary')
  }

  protected async [Service.init](): Promise<void> {
    const storage = await openPromptStorage<PromptResourceId, StoredPromptPayload>(this.ctx, PROMPT_LIBRARY_DOMAIN_SPEC, PROMPT_LIBRARY_TABLE_NAME)
    this.table = storage.table
    this.ctx.effect(() => async () => {
      this.table = undefined
      await storage.close()
    }, 'dshContextPromptLibrary.domainClose')
  }

  list(): readonly PromptResourceListItem[] {
    return Object.freeze([...this.requireTable().entries()].map(([id, raw]) => {
      const parsed = PROMPT_RESOURCE_SCHEMA.safeParse(raw)
      if (!parsed.success) return Object.freeze({ status: 'invalid' as const, id, message: parsed.error.message })
      const resource = parsed.data
      return Object.freeze({
        status: 'usable' as const,
        id,
        name: resource.name,
        ...(resource.description === undefined ? {} : { description: resource.description }),
        revision: resource.revision,
      })
    }))
  }

  get(id: PromptResourceId): PromptResourceSnapshot {
    const raw = this.requireStored(id)
    try {
      return snapshotOf(id, PROMPT_RESOURCE_SCHEMA.parse(raw))
    } catch (error) {
      throw invalidPromptResource(error)
    }
  }

  async createPrompt(id: PromptResourceId, input: PromptResourceInput): Promise<PromptMutationReceipt> {
    if (typeof id !== 'string') throw invalidPromptResource(new TypeError('prompt resource id must be a string'))
    const parsed = this.parseInput(input)
    return await this.enqueueOperation(async () => {
      const table = this.requireTable()
      if (table.get(id) !== undefined) throw new ContextManagerError('prompt-resource-exists', `prompt resource ${JSON.stringify(id)} already exists`)
      const resource: PromptResource = { ...parsed, revision: 1 }
      await table.put(id, resource)
      this.markPromptResourcesChanged()
      return receiptOf(id, 1)
    })
  }

  async replacePrompt(id: PromptResourceId, input: PromptResourceInput, expectedRevision: number): Promise<PromptMutationReceipt> {
    const parsed = this.parseInput(input)
    return await this.updateStored(id, expectedRevision, (current, revision) => {
      const object = this.requireEditableObject(id, current)
      const { name: _oldName, description: _oldDescription, content: _oldContent, revision: _oldRevision, ...oldExtensions } = object
      const { name, description, content, ...newExtensions } = parsed
      return { ...oldExtensions, ...newExtensions, name, ...(description === undefined ? {} : { description }), content, revision: revision + 1 }
    })
  }

  async setPromptName(id: PromptResourceId, name: string, expectedRevision: number): Promise<PromptMutationReceipt> {
    if (typeof name !== 'string') throw invalidPromptResource(new TypeError('prompt name must be a string'))
    return await this.updateStored(id, expectedRevision, (current, revision) => ({ ...this.requireEditableObject(id, current), name, revision: revision + 1 }))
  }

  async setPromptDescription(id: PromptResourceId, description: string | undefined, expectedRevision: number): Promise<PromptMutationReceipt> {
    if (description !== undefined && typeof description !== 'string') throw invalidPromptResource(new TypeError('prompt description must be a string when present'))
    return await this.updateStored(id, expectedRevision, (current, revision) => {
      const { description: _oldDescription, ...rest } = this.requireEditableObject(id, current)
      return description === undefined ? { ...rest, revision: revision + 1 } : { ...rest, description, revision: revision + 1 }
    })
  }

  async setPromptContent(id: PromptResourceId, content: string, expectedRevision: number): Promise<PromptMutationReceipt> {
    if (typeof content !== 'string') throw invalidPromptResource(new TypeError('prompt content must be a string'))
    return await this.updateStored(id, expectedRevision, (current, revision) => ({ ...this.requireEditableObject(id, current), content, revision: revision + 1 }))
  }

  async deletePrompt(id: PromptResourceId, expectedRevision: number): Promise<void> {
    await this.enqueueOperation(async () => {
      const table = this.requireTable()
      const current = table.get(id)
      if (current === undefined) throw this.notFound(id)
      this.assertRevision(id, this.requireRevision(id, current), expectedRevision)
      const deleted = await table.delete(id)
      if (!deleted) throw this.notFound(id)
      this.markPromptResourcesChanged()
    })
  }

  private parseInput(input: PromptResourceInput): PromptResourceInput {
    if (typeof input === 'object' && input !== null && Object.hasOwn(input, 'revision')) {
      throw invalidPromptResource(new TypeError('prompt resource revision is library-owned'))
    }
    try {
      const parsed = PROMPT_RESOURCE_INPUT_SCHEMA.parse(input)
      assertJsonDataShape(parsed)
      return parsed
    } catch (error) {
      if (error instanceof ContextManagerError) throw error
      throw invalidPromptResource(error)
    }
  }

  private requireTable(): PromptStorageTable<PromptResourceId, StoredPromptPayload> {
    if (this.table === undefined) throw new ContextManagerError('prompt-library-not-ready', 'Context Manager prompt library storage is not ready')
    return this.table
  }

  private requireStored(id: PromptResourceId): StoredPromptPayload {
    const resource = this.requireTable().get(id)
    if (resource === undefined) throw this.notFound(id)
    return resource
  }

  private requireEditableObject(id: PromptResourceId, raw: StoredPromptPayload): Record<string, unknown> {
    if (!isPlainObject(raw)) throw new ContextManagerError('prompt-resource-path-not-editable', `prompt resource ${JSON.stringify(id)} is not an object; replace it explicitly`)
    return raw
  }

  private requireRevision(id: PromptResourceId, raw: StoredPromptPayload): number {
    const object = this.requireEditableObject(id, raw)
    if (!Number.isInteger(object.revision) || (object.revision as number) < 1) {
      throw new ContextManagerError('prompt-resource-path-not-editable', `prompt resource ${JSON.stringify(id)} has no usable positive-integer revision fence`)
    }
    return object.revision as number
  }

  private notFound(id: PromptResourceId): ContextManagerError {
    return new ContextManagerError('prompt-resource-not-found', `prompt resource ${JSON.stringify(id)} does not exist`)
  }

  private assertRevision(id: PromptResourceId, currentRevision: number, expectedRevision: number): void {
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) throw new ContextManagerError('invalid-prompt-resource', `expected revision for prompt resource ${JSON.stringify(id)} must be a positive integer`)
    if (currentRevision !== expectedRevision) throw new ContextManagerError('prompt-resource-conflict', `prompt resource ${JSON.stringify(id)} revision conflict: expected ${String(expectedRevision)}, current ${String(currentRevision)}`)
  }

  private async updateStored(id: PromptResourceId, expectedRevision: number, update: (current: StoredPromptPayload, revision: number) => StoredPromptPayload): Promise<PromptMutationReceipt> {
    return await this.enqueueOperation(async () => {
      const table = this.requireTable()
      if (table.get(id) === undefined) throw this.notFound(id)
      let nextRevision = 0
      await table.update(id, (current) => {
        const revision = this.requireRevision(id, current)
        this.assertRevision(id, revision, expectedRevision)
        const next = update(current, revision)
        assertJsonDataShape(next)
        nextRevision = revision + 1
        return next
      })
      this.markPromptResourcesChanged()
      return receiptOf(id, nextRevision)
    })
  }

  private markPromptResourcesChanged(): void {
    const tracker = this.ctx.get('dshContextChanges') as
      | { markPromptResources(): void }
      | undefined
    tracker?.markPromptResources()
  }

  private enqueueOperation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(operation, operation)
    this.operationTail = result.then(() => {}, () => {})
    return result
  }
}
