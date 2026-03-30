import { Injectable, Scope } from '@nestjs/common';
import { asyncLocalStorage } from './request-id.middleware';

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

@Injectable({ scope: Scope.DEFAULT })
export class LoggerService {
  private formatMessage(level: LogLevel, message: string, context?: string): string {
    const store = asyncLocalStorage.getStore();
    const requestId = store?.requestId ? ` [${store.requestId}]` : '';
    const ctx = context ? ` [${context}]` : '';
    return `${level.toUpperCase()}${requestId}${ctx}: ${message}`;
  }

  debug(message: string, context?: string): void {
    console.debug(this.formatMessage(LogLevel.DEBUG, message, context));
  }

  info(message: string, context?: string): void {
    console.info(this.formatMessage(LogLevel.INFO, message, context));
  }

  warn(message: string, context?: string): void {
    console.warn(this.formatMessage(LogLevel.WARN, message, context));
  }

  error(message: string, context?: string): void {
    console.error(this.formatMessage(LogLevel.ERROR, message, context));
  }

  log(message: string, context?: string): void {
    console.log(this.formatMessage(LogLevel.INFO, message, context));
  }
}
