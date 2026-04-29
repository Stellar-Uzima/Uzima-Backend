import { Injectable, LoggerService, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
  VERBOSE = 'verbose',
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  trace?: string;
  userId?: string;
  requestId?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class CustomLogger implements LoggerService {
  private logDir: string;
  private maxFileSize: number;
  private maxFiles: number;
  private currentLogFile: string;
  private logLevel: LogLevel;

  constructor(@Inject(ConfigService) private configService: ConfigService) {
    this.logDir = this.configService.get<string>('LOG_DIR', 'logs');
    this.maxFileSize = this.configService.get<number>('LOG_MAX_FILE_SIZE', 10 * 1024 * 1024); // 10MB
    this.maxFiles = this.configService.get<number>('LOG_MAX_FILES', 5);
    this.logLevel = this.configService.get<LogLevel>('LOG_LEVEL', LogLevel.INFO);
    
    this.ensureLogDirectory();
    this.currentLogFile = this.getCurrentLogFile();
  }

  private ensureLogDirectory(): void {
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }
  }

  private getCurrentLogFile(): string {
    const today = new Date().toISOString().split('T')[0];
    return join(this.logDir, `app-${today}.log`);
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.ERROR, LogLevel.WARN, LogLevel.INFO, LogLevel.DEBUG, LogLevel.VERBOSE];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex <= currentLevelIndex;
  }

  private rotateLogFile(): void {
    if (!existsSync(this.currentLogFile)) {
      return;
    }

    const stats = require('fs').statSync(this.currentLogFile);
    if (stats.size < this.maxFileSize) {
      return;
    }

    // Rotate current log file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rotatedFile = this.currentLogFile.replace('.log', `-${timestamp}.log`);
    
    try {
      require('fs').renameSync(this.currentLogFile, rotatedFile);
      this.cleanupOldLogs();
    } catch (error) {
      this.error('Failed to rotate log file', error instanceof Error ? error.stack : String(error));
    }
  }

  private cleanupOldLogs(): void {
    try {
      const files = require('fs').readdirSync(this.logDir)
        .filter((file: string) => file.endsWith('.log'))
        .map((file: string) => ({
          name: file,
          path: join(this.logDir, file),
          mtime: require('fs').statSync(join(this.logDir, file)).mtime,
        }))
        .sort((a: any, b: any) => b.mtime - a.mtime);

      // Keep only the most recent files
      if (files.length > this.maxFiles) {
        const filesToDelete = files.slice(this.maxFiles);
        filesToDelete.forEach((file: any) => {
          try {
            require('fs').unlinkSync(file.path);
          } catch (error) {
            this.error('Failed to delete old log file', error instanceof Error ? error.stack : String(error));
          }
        });
      }
    } catch (error) {
      this.error('Failed to cleanup old logs', error instanceof Error ? error.stack : String(error));
    }
  }

  private formatLogEntry(entry: LogEntry): string {
    const logObject = {
      timestamp: entry.timestamp,
      level: entry.level.toUpperCase(),
      message: entry.message,
      ...(entry.context && { context: entry.context }),
      ...(entry.userId && { userId: entry.userId }),
      ...(entry.requestId && { requestId: entry.requestId }),
      ...(entry.trace && { trace: entry.trace }),
      ...(entry.metadata && { metadata: entry.metadata }),
    };

    return JSON.stringify(logObject);
  }

  private writeLog(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) {
      return;
    }

    this.rotateLogFile();

    const formattedEntry = this.formatLogEntry(entry);
    const logLine = formattedEntry + '\n';

    try {
      appendFileSync(this.currentLogFile, logLine, 'utf8');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }

    // Also output to console for development
    if (this.configService.get<string>('NODE_ENV') !== 'production') {
      const colorMap = {
        [LogLevel.ERROR]: '\x1b[31m', // Red
        [LogLevel.WARN]: '\x1b[33m',  // Yellow
        [LogLevel.INFO]: '\x1b[36m',  // Cyan
        [LogLevel.DEBUG]: '\x1b[35m', // Magenta
        [LogLevel.VERBOSE]: '\x1b[37m', // White
      };
      
      const reset = '\x1b[0m';
      const color = colorMap[entry.level] || reset;
      
      console.log(`${color}[${entry.timestamp}] ${entry.level.toUpperCase()}: ${entry.message}${reset}`);
      if (entry.context) console.log(`Context: ${entry.context}`);
      if (entry.metadata) console.log('Metadata:', entry.metadata);
    }
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: string,
    trace?: string,
    metadata?: Record<string, any>
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      trace,
      metadata,
    };
  }

  error(message: string, trace?: string, context?: string, metadata?: Record<string, any>): void {
    const entry = this.createLogEntry(LogLevel.ERROR, message, context, trace, metadata);
    this.writeLog(entry);
  }

  warn(message: string, context?: string, metadata?: Record<string, any>): void {
    const entry = this.createLogEntry(LogLevel.WARN, message, context, undefined, metadata);
    this.writeLog(entry);
  }

  log(message: string, context?: string, metadata?: Record<string, any>): void {
    const entry = this.createLogEntry(LogLevel.INFO, message, context, undefined, metadata);
    this.writeLog(entry);
  }

  debug(message: string, context?: string, metadata?: Record<string, any>): void {
    const entry = this.createLogEntry(LogLevel.DEBUG, message, context, undefined, metadata);
    this.writeLog(entry);
  }

  verbose(message: string, context?: string, metadata?: Record<string, any>): void {
    const entry = this.createLogEntry(LogLevel.VERBOSE, message, context, undefined, metadata);
    this.writeLog(entry);
  }

  // Enhanced logging methods for specific use cases
  logUserAction(userId: string, action: string, context?: string, metadata?: Record<string, any>): void {
    const entry = this.createLogEntry(
      LogLevel.INFO,
      `User action: ${action}`,
      context,
      undefined,
      { ...metadata, userId, action }
    );
    this.writeLog(entry);
  }

  logApiRequest(method: string, url: string, userId?: string, requestId?: string, metadata?: Record<string, any>): void {
    const entry = this.createLogEntry(
      LogLevel.INFO,
      `API Request: ${method} ${url}`,
      'HTTP',
      undefined,
      { method, url, userId, requestId, ...metadata }
    );
    this.writeLog(entry);
  }

  logApiError(method: string, url: string, error: Error, userId?: string, requestId?: string, metadata?: Record<string, any>): void {
    const entry = this.createLogEntry(
      LogLevel.ERROR,
      `API Error: ${method} ${url} - ${error.message}`,
      'HTTP',
      error.stack,
      { method, url, userId, requestId, ...metadata }
    );
    this.writeLog(entry);
  }

  logSecurityEvent(event: string, severity: 'low' | 'medium' | 'high', userId?: string, metadata?: Record<string, any>): void {
    const level = severity === 'high' ? LogLevel.ERROR : severity === 'medium' ? LogLevel.WARN : LogLevel.INFO;
    const entry = this.createLogEntry(
      level,
      `Security Event: ${event}`,
      'SECURITY',
      undefined,
      { event, severity, userId, ...metadata }
    );
    this.writeLog(entry);
  }

  logPerformance(operation: string, duration: number, metadata?: Record<string, any>): void {
    const level = duration > 5000 ? LogLevel.WARN : duration > 2000 ? LogLevel.INFO : LogLevel.DEBUG;
    const entry = this.createLogEntry(
      level,
      `Performance: ${operation} took ${duration}ms`,
      'PERFORMANCE',
      undefined,
      { operation, duration, ...metadata }
    );
    this.writeLog(entry);
  }

  // Method to get log statistics
  getLogStats(): { totalFiles: number; totalSize: number; currentLogFile: string } {
    try {
      const files = require('fs').readdirSync(this.logDir)
        .filter((file: string) => file.endsWith('.log'))
        .map((file: string) => join(this.logDir, file));

      let totalSize = 0;
      files.forEach((file: string) => {
        try {
          totalSize += require('fs').statSync(file).size;
        } catch (error) {
          // Ignore files that can't be accessed
        }
      });

      return {
        totalFiles: files.length,
        totalSize,
        currentLogFile: this.currentLogFile,
      };
    } catch (error) {
      return {
        totalFiles: 0,
        totalSize: 0,
        currentLogFile: this.currentLogFile,
      };
    }
  }
}
