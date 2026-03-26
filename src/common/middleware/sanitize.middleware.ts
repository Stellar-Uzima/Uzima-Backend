import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import xss from 'xss';

@Injectable()
export class SanitizeMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    if (req.body) {
      req.body = this.sanitizeObject(req.body);
    }
    if (req.query) {
      req.query = this.sanitizeObject(req.query);
    }
    next();
  }

  /**
   * Recursively sanitizes all string fields in an object or array
   */
  private sanitizeObject(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    // Handle arrays
    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeObject(item));
    }

    // Handle objects
    if (typeof obj === 'object') {
      const sanitized: any = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          sanitized[key] = this.sanitizeValue(obj[key]);
        }
      }
      return sanitized;
    }

    // Handle primitives
    return this.sanitizeValue(obj);
  }

  /**
   * Sanitizes a single value based on its type
   */
  private sanitizeValue(value: any): any {
    if (typeof value === 'string') {
      return this.sanitizeString(value);
    }

    // Recursively handle nested objects and arrays
    if (typeof value === 'object' && value !== null) {
      return this.sanitizeObject(value);
    }

    // Return non-string, non-object types as-is (numbers, booleans, etc.)
    return value;
  }

  /**
   * Sanitizes a string by:
   * 1. Trimming leading and trailing whitespace
   * 2. Removing null bytes
   * 3. Escaping HTML special characters to prevent XSS
   */
  private sanitizeString(str: string): string {
    if (!str) {
      return str;
    }

    // Trim whitespace
    let sanitized = str.trim();

    // Remove null bytes
    sanitized = sanitized.replace(/\0/g, '');

    // Escape HTML special characters using xss library
    sanitized = xss(sanitized);

    return sanitized;
  }
}
