import { Injectable, LoggerService } from '@nestjs/common';
import { CustomLogger } from './logger.service';

@Injectable()
export class StructuredNestLogger implements LoggerService {
  constructor(private readonly logger: CustomLogger) {}

  log(message: any, ...optionalParams: any[]): void {
    const { context, metadata } = this.parseOptionalParams(optionalParams);
    this.logger.log(String(message), context, metadata);
  }

  error(message: any, ...optionalParams: any[]): void {
    const strings = optionalParams.filter(
      (param): param is string => typeof param === 'string',
    );
    const trace = strings.find((param) => /(^Error:|\n\s*at )/.test(param));
    const context = strings.filter((param) => param !== trace).pop();
    const error = optionalParams.find((param) => param instanceof Error);
    const metadata = optionalParams.find(
      (param) =>
        param &&
        typeof param === 'object' &&
        !(param instanceof Error),
    );

    this.logger.error(
      String(message),
      trace || error?.stack,
      context,
      metadata,
    );
  }

  warn(message: any, ...optionalParams: any[]): void {
    const { context, metadata } = this.parseOptionalParams(optionalParams);
    this.logger.warn(String(message), context, metadata);
  }

  debug(message: any, ...optionalParams: any[]): void {
    const { context, metadata } = this.parseOptionalParams(optionalParams);
    this.logger.debug(String(message), context, metadata);
  }

  verbose(message: any, ...optionalParams: any[]): void {
    const { context, metadata } = this.parseOptionalParams(optionalParams);
    this.logger.verbose(String(message), context, metadata);
  }

  private parseOptionalParams(params: any[]): {
    context?: string;
    metadata?: Record<string, any>;
  } {
    return {
      context: params.filter((param): param is string => typeof param === 'string').pop(),
      metadata: params.find(
        (param) =>
          param &&
          typeof param === 'object' &&
          !(param instanceof Error),
      ),
    };
  }
}
