import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const { method, originalUrl, url } = request;
    const targetUrl = originalUrl || url;
    const startTime = Date.now();

    this.logger.log(`⏳ --> ${method} ${targetUrl}`);

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - startTime;
        const statusCode = response.statusCode || HttpStatus.OK;
        this.logger.log(`✅ <-- ${method} ${targetUrl} [${statusCode}] +${duration}ms`);
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;
        const status =
          error instanceof HttpException
            ? error.getStatus()
            : HttpStatus.INTERNAL_SERVER_ERROR;

        const message =
          error?.response?.message || error?.message || 'Error interno';

        const formattedMessage = Array.isArray(message)
          ? message.join(', ')
          : message;

        this.logger.error(
          `❌ <-- ${method} ${targetUrl} [${status}] +${duration}ms - ${formattedMessage}`,
        );

        return throwError(() => error);
      }),
    );
  }
}
