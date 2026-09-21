import type {
  ContextManagerRemoteError,
  ContextManagerRemoteErrorCode,
  ContextManagerRemoteResult,
} from './types.js'

const BUSINESS_CODES = new Set<ContextManagerRemoteErrorCode>([
  'profile-exists',
  'profile-not-found',
  'profile-path-not-editable',
  'skill-binding-not-found',
  'prompt-binding-exists',
  'prompt-binding-not-found',
  'invalid-profile',
  'invalid-skill-mode',
  'invalid-prompt-binding',
  'invalid-prompt-placement',
  'invalid-prompt-order',
  'unsafe-path-key',
  'persistence-unavailable',
  'persistence-not-ready',
  'persistence-read-only',
  'persistence-document-invalid',
  'preset-authoring-unavailable',
  'prompt-library-not-ready',
  'prompt-resource-exists',
  'prompt-resource-not-found',
  'prompt-resource-conflict',
  'prompt-resource-path-not-editable',
  'invalid-prompt-resource',
  'invalid-schema-version',
  'unsupported-schema-version',
])

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined
}

function messageOf(record: Record<string, unknown>): string {
  return typeof record.message === 'string' ? record.message : 'Context Manager operation failed'
}

export function invalidRevision(expectedRevision: number): ContextManagerRemoteError | undefined {
  if (Number.isSafeInteger(expectedRevision) && expectedRevision >= 0) return undefined
  return Object.freeze({
    code: 'invalid-revision',
    message: 'expectedRevision must be a non-negative safe integer',
  })
}

export function mapBusinessError(error: unknown): ContextManagerRemoteError | undefined {
  const record = asRecord(error)
  if (record === undefined) return undefined

  if (
    record.code === 'SETTINGS_CONFLICT'
    && Number.isSafeInteger(record.expected)
    && Number.isSafeInteger(record.actual)
  ) {
    return Object.freeze({
      code: 'profile-conflict',
      message: messageOf(record),
      expectedRevision: record.expected as number,
      actualRevision: record.actual as number,
    })
  }

  if (typeof record.code === 'string' && BUSINESS_CODES.has(record.code as ContextManagerRemoteErrorCode)) {
    return Object.freeze({
      code: record.code as ContextManagerRemoteErrorCode,
      message: messageOf(record),
    })
  }
  return undefined
}

const SAFE_REMOTE_INTERNAL_MESSAGE = 'Context Manager Remote operation failed'

export function sanitizeUnexpectedRemoteError(error: unknown): Error {
  return new Error(SAFE_REMOTE_INTERNAL_MESSAGE, { cause: error })
}

export function remoteRead<T>(operation: () => T): T {
  try {
    return operation()
  } catch (error) {
    throw sanitizeUnexpectedRemoteError(error)
  }
}

export async function remoteReadAsync<T>(
  operation: () => Promise<T> | T,
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    throw sanitizeUnexpectedRemoteError(error)
  }
}

export function ok<T>(value: T): ContextManagerRemoteResult<T> {
  return Object.freeze({ ok: true, value })
}

export function fail<T>(error: ContextManagerRemoteError): ContextManagerRemoteResult<T> {
  return Object.freeze({ ok: false, error })
}

export async function businessResult<T>(
  operation: () => Promise<T> | T,
): Promise<ContextManagerRemoteResult<T>> {
  try {
    return ok(await operation())
  } catch (error) {
    const mapped = mapBusinessError(error)
    if (mapped === undefined) throw sanitizeUnexpectedRemoteError(error)
    return fail(mapped)
  }
}
