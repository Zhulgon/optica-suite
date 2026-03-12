import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

type ErrorPayload = {
  statusCode: number;
  timestamp: string;
  path: string;
  message: string | string[];
  requestId: string;
  error?: string;
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const requestIdHeader = request.header('x-request-id');
    const requestId =
      typeof requestIdHeader === 'string' && requestIdHeader.trim().length > 0
        ? requestIdHeader
        : 'n/a';
    const timestamp = new Date().toISOString();

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const baseResponse = exception.getResponse();
      const payload = this.normalizeHttpException(
        baseResponse,
        statusCode,
        request,
        timestamp,
        requestId,
      );
      this.logException(payload, request, exception);
      response.status(statusCode).json(payload);
      return;
    }

    const payload: ErrorPayload = {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      timestamp,
      path: request.url,
      message: 'Internal server error',
      requestId,
      error: 'Internal Server Error',
    };

    this.logException(payload, request, exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(payload);
  }

  private normalizeHttpException(
    baseResponse: string | object,
    statusCode: number,
    request: Request,
    timestamp: string,
    requestId: string,
  ): ErrorPayload {
    if (typeof baseResponse === 'string') {
      return {
        statusCode,
        timestamp,
        path: request.url,
        message: baseResponse,
        requestId,
      };
    }

    const body = baseResponse as Partial<ErrorPayload>;
    return {
      statusCode,
      timestamp,
      path: request.url,
      message: body.message ?? 'Request failed',
      requestId,
      error: body.error,
    };
  }

  private logException(
    payload: ErrorPayload,
    request: Request,
    exception: unknown,
  ) {
    const details = {
      requestId: payload.requestId,
      statusCode: payload.statusCode,
      method: request.method,
      path: request.url,
      message: payload.message,
      timestamp: payload.timestamp,
    };

    if (payload.statusCode >= 500) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(JSON.stringify(details), stack);
      return;
    }

    this.logger.warn(JSON.stringify(details));
  }
}
