export type CreatorQueryResult<T> = {
  data: T;
  error: unknown;
};

function databaseErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null;
  return typeof error.code === 'string' ? error.code : null;
}

export class CreatorDataAccessError extends Error {
  readonly operation: string;
  readonly databaseCode: string | null;

  constructor(operation: string, cause: unknown) {
    super(`Creator Studio could not load ${operation}.`, { cause });
    this.name = 'CreatorDataAccessError';
    this.operation = operation;
    this.databaseCode = databaseErrorCode(cause);
  }
}

export function readCreatorQueryData<T>(
  result: CreatorQueryResult<T>,
  operation: string
): T {
  if (result.error) {
    throw new CreatorDataAccessError(operation, result.error);
  }

  return result.data;
}

export function assertCreatorQuerySucceeded(
  error: unknown,
  operation: string
): void {
  if (error) {
    throw new CreatorDataAccessError(operation, error);
  }
}
