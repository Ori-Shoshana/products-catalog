import httpStatus from 'http-status-codes';
import { HttpError } from '@map-colonies/error-express-handler';

export class BadRequestError extends Error implements HttpError {
  public readonly status = httpStatus.BAD_REQUEST;

  public constructor(message: string) {
    super(message);
    this.name = 'BadRequestError';
  }
}

export class InternalServerError extends Error implements HttpError {
  public readonly status = httpStatus.INTERNAL_SERVER_ERROR;

  public constructor(message: string) {
    super(message);
    this.name = 'InternalServerError';
  }
}

export class NotFoundError extends Error implements HttpError {
  public readonly status = httpStatus.NOT_FOUND;

  public constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ServiceUnavailableError extends Error implements HttpError {
  public readonly status = httpStatus.SERVICE_UNAVAILABLE;

  public constructor(message: string) {
    super(message);
    this.name = 'ServiceUnavailableError';
  }
}
