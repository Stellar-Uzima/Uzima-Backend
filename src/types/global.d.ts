// Minimal global declarations to reduce noisy type errors during CI triage
declare function ApiProperty(options?: any): PropertyDecorator;
declare function ApiPropertyOptional(options?: any): PropertyDecorator;

declare module 'winston' {
  export class Logger {
    constructor(options?: any);
    error(message: string, meta?: any): void;
    warn(message: string, meta?: any): void;
    info(message: string, meta?: any): void;
    debug(message: string, meta?: any): void;
  }
  export function createLogger(options?: any): Logger;
  export const format: any;
  export const transports: any;
}

declare module 'xss';
declare module 'bullmq';
declare module '@nestjs/bullmq';

declare module '*.png';
declare module '*.jpg';
