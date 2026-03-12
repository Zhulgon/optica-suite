import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const rawHeader = req.header('x-request-id');
    const requestId =
      typeof rawHeader === 'string' && rawHeader.trim().length > 0
        ? rawHeader.trim()
        : randomUUID();

    res.setHeader('x-request-id', requestId);
    next();
  }
}
