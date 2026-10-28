import { randomUUID } from 'node:crypto'
import { Service, type Context } from '@deepseek-ai/cordis'

import { openPromptStorage, type PromptStorageTable } from '../adapters/storage-domain.js'
import { ContextManagerError } from '../domain/errors.js'
import { assertJsonDataShape, isPlainObject } from '../domain/storage.js'
import {
  PROMPT_LIBRARY_DOMAIN_SPEC,
  PROMPT_LIBRARY_TABLE_NAME,
  PROMPT_RESOURCE_INCARNATION_FIELD,
  PROMPT_RESOURCE_INPUT_SCHEMA,
  PROMPT_RESOURCE_SCHEMA,
  type PromptMutationReceipt,
  type PromptResourceCreateBasis,
  type PromptResourceMutationBasis,
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
  private storageAuthorityId?: string
  private operationTail: Promise<void> = Promise.resolve()

  constructor(ctx: Context) {
    super(ctx, 'dshContextPromptLibrary')
  }

  protected async [Service.init](): Promise<void> {
    const storage = await openPromptStorage<PromptResourceId, StoredPromptPayload>(this.ctx, PROMPT_LIBRARY_DOMAIN_SPEC, PROMPT_LIBRARY_TABLE_NAME)
    this.table = storage.table
    this.storageAuthorityId = randomUUID()
    this.ctx.effect(() => async () => {
      this.storageAuthorityId = undefined
      this.table = undefined
      await storage.close()
    }, 'dshContextPromptLibrary.domainClose')
  }

  /** Identity of the currently opened Prompt Library storage-source lifetime. */
  resourceWriteAuthority(): string | undefined {
    return this.table === undefined ? undefined : this.storageAuthorityId
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
        incarnationId: resource[PROMPT_RESOURCE_INCARNATION_FIELD] ?? null,
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

  async createPrompt(id: PromptResourceId, input: PromptResourceInput, basis: PromptResourceCreateBasis): Promise<PromptMutationReceipt> {
    if (typeof id !== 'string') throw invalidPromptResource(new TypeError('prompt resource id must be a string'))
    const parsed = this.parseInput(input)
    return await this.enqueueOperation(async () => {
      this.assertAuthority(basis)
      const table = this.requireTable()
      if (table.get(id) !== undefined) throw new ContextManagerError('prompt-resource-exists', `prompt resource ${JSON.stringify(id)} already exists`)
      const resource: PromptResource = { ...parsed, revision: 1, [PROMPT_RESOURCE_INCARNATION_FIELD]: randomUUID() }
      await table.put(id, resource)
      this.markPromptResourcesChanged()
      return receiptOf(id, 1)
    })
  }

  async replacePrompt(id: PromptResourceId, input: PromptResourceInput, basis: PromptResourceMutationBasis): Promise<PromptMutationReceipt> {
    const parsed = this.parseInput(input)
    return await this.updateStored(id, basis, (current, revision) => {
      const object = this.requireEditableObject(id, current)
      const { name: _oldName, description: _oldDescription, content: _oldContent, revision: _oldRevision, ...oldExtensions } = object
      const { name, description, content, ...newExtensions } = parsed
      return { ...oldExtensions, ...newExtensions, name, ...(description === undefined ? {} : { description }), content, revision: revision + 1 }
    })
  }

  async setPromptName(id: PromptResourceId, name: string, basis: PromptResourceMutationBasis): Promise<PromptMutationReceipt> {
    if (typeof name !== 'string') throw invalidPromptResource(new TypeError('prompt name must be a string'))
    return await this.updateStored(id, basis, (current, revision) => ({ ...this.requireEditableObject(id, current), name, revision: revision + 1 }))
  }

  async setPromptDescription(id: PromptResourceId, description: string | undefined, basis: PromptResourceMutationBasis): Promise<PromptMutationReceipt> {
    if (description !== undefined && typeof description !== 'string') throw invalidPromptResource(new TypeError('prompt description must be a string when present'))
    return await this.updateStored(id, basis, (current, revision) => {
      const { description: _oldDescription, ...rest } = this.requireEditableObject(id, current)
      return description === undefined ? { ...rest, revision: revision + 1 } : { ...rest, description, revision: revision + 1 }
    })
  }

  async setPromptContent(id: PromptResourceId, content: string, basis: PromptResourceMutationBasis): Promise<PromptMutationReceipt> {
    if (typeof content !== 'string') throw invalidPromptResource(new TypeError('prompt content must be a string'))
    return await this.updateStored(id, basis, (current, revision) => ({ ...this.requireEditableObject(id, current), content, revision: revision + 1 }))
  }

  async deletePrompt(id: PromptResourceId, basis: PromptResourceMutationBasis): Promise<void> {
    await this.enqueueOperation(async () => {
      this.assertAuthority(basis)
      const table = this.requireTable()
      const current = table.get(id)
      if (current === undefined) throw this.notFound(id)
      this.assertMutationBasis(id, current, basis)
      const deleted = await table.delete(id)
      if (!deleted) throw this.notFound(id)
      this.markPromptResourcesChanged()
    })
  }

  private parseInput(input: PromptResourceInput): PromptResourceInput {
    if (typeof input === 'object' && input !== null && (
      Object.hasOwn(input, 'revision') || Object.hasOwn(input, PROMPT_RESOURCE_INCARNATION_FIELD)
    )) {
      throw invalidPromptResource(new TypeError('prompt resource revision and incarnation are library-owned'))
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
    if (!Number.isSafeInteger(object.revision) || (object.revision as number) < 1) {
      throw new ContextManagerError('prompt-resource-path-not-editable', `prompt resource ${JSON.stringify(id)} has no usable positive-integer revision fence`)
    }
    return object.revision as number
  }

  private notFound(id: PromptResourceId): ContextManagerError {
    return new ContextManagerError('prompt-resource-not-found', `prompt resource ${JSON.stringify(id)} does not exist`)
  }

  private assertAuthority(basis: PromptResourceCreateBasis): void {
    if (typeof basis?.resourceAuthorityId !== 'string' || basis.resourceAuthorityId.length === 0) {
      throw invalidPromptResource(new TypeError('a Resource Authority basis is required'))
    }
    if (basis.resourceAuthorityId !== this.resourceWriteAuthority()) {
      throw new ContextManagerError('prompt-resource-authority-conflict', 'Prompt Library storage-source authority changed')
    }
  }

  private requireIncarnation(id: PromptResourceId, raw: StoredPromptPayload): string | null {
    const object = this.requireEditableObject(id, raw)
    const stored = object[PROMPT_RESOURCE_INCARNATION_FIELD]
    if (stored === undefined) return null
    if (typeof stored !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored)) {
      throw new ContextManagerError('prompt-resource-path-not-editable', `resource ${JSON.stringify(id)} has an invalid reserved incarnation field`)
    }
    return stored
  }

  private assertMutationBasis(id: PromptResourceId, raw: StoredPromptPayload, basis: PromptResourceMutationBasis): number {
    this.assertAuthority(basis)
    if (basis.resourceId !== id || (basis.incarnationId !== null && typeof basis.incarnationId !== 'string')) {
      throw invalidPromptResource(new TypeError('a matching resource identity basis is required'))
    }
    const revision = this.requireRevision(id, raw)
    const incarnationId = this.requireIncarnation(id, raw)
    if (incarnationId !== basis.incarnationId) {
      throw new ContextManagerError('prompt-resource-incarnation-conflict', `prompt resource ${JSON.stringify(id)} was replaced after the edit began`)
    }
    if (!Number.isSafeInteger(basis.revision) || basis.revision < 1) {
      throw invalidPromptResource(new TypeError('resource mutation revision must be a positive safe integer'))
    }
    if (revision !== basis.revision) {
      throw new ContextManagerError('prompt-resource-conflict', `prompt resource ${JSON.stringify(id)} revision conflict: expected ${String(basis.revision)}, current ${String(revision)}`)
    }
    return revision
  }

  private async updateStored(id: PromptResourceId, basis: PromptResourceMutationBasis, update: (current: StoredPromptPayload, revision: number) => StoredPromptPayload): Promise<PromptMutationReceipt> {
    return await this.enqueueOperation(async () => {
      this.assertAuthority(basis)
      const table = this.requireTable()
      if (table.get(id) === undefined) throw this.notFound(id)
      let nextRevision = 0
      await table.update(id, (current) => {
        const revision = this.assertMutationBasis(id, current, basis)
        if (revision === Number.MAX_SAFE_INTEGER) {
          throw new ContextManagerError('prompt-resource-path-not-editable', `resource ${JSON.stringify(id)} revision has reached the safe-integer limit`)
        }
        const next = this.requireEditableObject(id, update(current, revision))
        // Also migrate pre-B2-B resources without scanning/updating them at startup.
        next[PROMPT_RESOURCE_INCARNATION_FIELD] = basis.incarnationId ?? randomUUID()
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
