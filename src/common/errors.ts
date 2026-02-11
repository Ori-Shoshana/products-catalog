import httpStatus from 'http-status-codes';
import { HttpError } from '@map-colonies/error-express-handler';

export abstract class BaseHttpError extends Error implements HttpError {
  public readonly status: number;

  public constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class BadRequestError extends BaseHttpError {
  public constructor(message: string) {
    super(httpStatus.BAD_REQUEST, message);
  }
}

export class NotFoundError extends BaseHttpError {
  public constructor(message: string) {
    super(httpStatus.NOT_FOUND, message);
  }
}

export class InternalServerError extends BaseHttpError {
  public constructor(message: string) {
    super(httpStatus.INTERNAL_SERVER_ERROR, message);
  }
}

export class ServiceUnavailableError extends BaseHttpError {
  public constructor(message: string) {
    super(httpStatus.SERVICE_UNAVAILABLE, message);
  }
}
