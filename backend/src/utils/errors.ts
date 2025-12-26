export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super('INVALID_REQUEST', message, 400);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string | number) {
    const message = id ? `${resource} with id ${id} not found` : `${resource} not found`;
    super(`${resource.toUpperCase()}_NOT_FOUND`, message, 404);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super('UNAUTHORIZED', message, 401);
    this.name = 'UnauthorizedError';
  }
}

export class MTAPIError extends AppError {
  constructor(message: string, public originalError?: Error) {
    super('MTAPI_ERROR', message, 502);
    this.name = 'MTAPIError';
  }
}

export function formatError(error: unknown): { code: string; message: string } {
  if (error instanceof AppError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof Error) {
    return { code: 'INTERNAL_ERROR', message: error.message };
  }
  return { code: 'INTERNAL_ERROR', message: 'Unknown error occurred' };
}

