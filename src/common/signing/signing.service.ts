import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class SigningService {
  private readonly logger = new Logger(SigningService.name);

  /**
   * Generates a signature for a given payload and timestamp.
   * @param method HTTP method (uppercase)
   * @param path Request path
   * @param body Stringified request body (or empty string)
   * @param timestamp Unix timestamp
   * @param secret Secret key for signing
   */
  generateSignature(
    method: string,
    path: string,
    body: string,
    timestamp: number,
    secret: string,
  ): string {
    const data = `${method.toUpperCase()}|${path}|${body}|${timestamp}`;
    return crypto
      .createHmac('sha256', secret)
      .update(data)
      .digest('hex');
  }

  /**
   * Verifies if a given signature is valid.
   */
  verifySignature(
    signature: string,
    method: string,
    path: string,
    body: any,
    timestamp: number,
    secret: string,
  ): boolean {
    const stringifiedBody = body ? JSON.stringify(body) : '';
    const expectedSignature = this.generateSignature(
      method,
      path,
      stringifiedBody,
      timestamp,
      secret,
    );

    // Constant time comparison to prevent timing attacks
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
      );
    } catch (e) {
      return false;
    }
  }

  /**
   * Prevents replay attacks by checking if the timestamp is within a valid window.
   * @param timestamp Unix timestamp from request
   * @param windowSeconds Validity window in seconds (default 5 minutes)
   */
  isTimestampValid(timestamp: number, windowSeconds = 300): boolean {
    const now = Math.floor(Date.now() / 1000);
    return Math.abs(now - timestamp) <= windowSeconds;
  }
}
