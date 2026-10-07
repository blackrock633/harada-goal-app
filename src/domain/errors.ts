export type DomainErrorCode = 'VALIDATION' | 'INVALID_STATE' | 'LIMIT_REACHED';

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly field?: string;

  constructor(code: DomainErrorCode, message: string, field?: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.field = field;
  }
}

export const isDomainError = (e: unknown): e is DomainError => e instanceof DomainError;
