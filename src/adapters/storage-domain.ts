import type { Context } from '@deepseek-ai/cordis'

export interface PromptStorageTable<K extends string, V> {
  get(key: K): V | undefined
  entries(): IterableIterator<[K, V]>
  put(key: K, value: V): Promise<void>
  delete(key: K): Promise<boolean>
  update(key: K, update: (current: V) => V): Promise<V>
}

export interface PromptStorageDomainSpec<V> {
  readonly name: string
  readonly version: number
  readonly tables: Readonly<Record<string, {
    readonly valueSchema: { parse(value: unknown): V }
  }>>
}

export interface PromptStorageHandle<K extends string, V> {
  readonly table: PromptStorageTable<K, V>
  close(): Promise<void>
}

function unsupportedApi(detail: string): TypeError {
  return new TypeError(`dsh-context-manager: unsupported storageDomain API; ${detail}`)
}

function requireObject(value: unknown, detail: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw unsupportedApi(detail)
  return value as Record<string, unknown>
}

function requireMethod(object: Record<string, unknown>, name: string, owner: string): Function {
  const method = object[name]
  if (typeof method !== 'function') throw unsupportedApi(`expected ${owner}.${name}()`)
  return method
}

export async function openPromptStorage<K extends string, V>(
  ctx: Context,
  spec: PromptStorageDomainSpec<V>,
  tableName: string,
): Promise<PromptStorageHandle<K, V>> {
  const capability = requireObject(ctx.get('storageDomain') as unknown, 'service value must be an object')
  const open = requireMethod(capability, 'open', 'storageDomain')
  const nativeDomain = requireObject(await open.call(capability, spec), 'storageDomain.open() must resolve to an object')
  const closeMethod = requireMethod(nativeDomain, 'close', 'storageDomain domain')

  let nativeTable: Record<string, unknown>
  try {
    const tableMethod = requireMethod(nativeDomain, 'table', 'storageDomain domain')
    nativeTable = requireObject(tableMethod.call(nativeDomain, tableName), 'storageDomain domain.table() must return an object')
    for (const method of ['get', 'entries', 'put', 'delete', 'update']) requireMethod(nativeTable, method, 'storageDomain table')
  } catch (error) {
    await closeMethod.call(nativeDomain)
    throw error
  }

  return {
    table: nativeTable as unknown as PromptStorageTable<K, V>,
    async close() { await closeMethod.call(nativeDomain) },
  }
}
