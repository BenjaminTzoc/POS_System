import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  statusCode: number;
  message: string;
  data: T;
  timestamp: string;
  path: string;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest();
    const response = ctx.getResponse();
    const statusCode = response.statusCode;

    return next.handle().pipe(
      map((data) => ({
        statusCode,
        message: this.getMessage(statusCode, data),
        data: this.cleanData(data),
        timestamp: new Date().toISOString(),
        path: request.url,
      })),
    );
  }

  private getMessage(statusCode: number, data: any): string {
    if (data?.message) return data.message;
    
    const messages = {
      200: 'Operación exitosa',
      201: 'Recurso creado exitosamente',
      204: 'Recurso eliminado exitosamente',
    };
    
    return messages[statusCode] || 'Operación completada';
  }

  private cleanData(data: any): any {
    if (data?.message && Object.keys(data).length === 1) {
      return null;
    }
    return data;
  }
}