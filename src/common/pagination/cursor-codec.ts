import { createHmac, timingSafeEqual } from 'node:crypto';
import { BadRequestApiException } from '../errors/api-error.exception';

/**
 * Opaque cursor encoding for keyset pagination (#1293).
 *
 * A cursor is base64url of a JSON payload plus an HMAC tag, so it cannot be
 * hand-edited by a client to walk the table in a different order, nor used to
 * smuggle a sort field that bypasses {@link assertSortableColumn}. Verification
 * is a constant-time compare, and a tampered or truncated cursor is a 400
 * (`INVALID_CURSOR`) rather than a silently wrong result set.
 */
export interface CursorPayload {
  /** Sort column the cursor was produced for. */
  f: string;
  /** Direction. */
  d: 'ASC' | 'DESC';
  /** Serialised value of the sort column in the last row of the page. */
  v: string | number | null;
  /** Serialised tiebreaker value (always the primary key). */
  k: string;
}

export class CursorCodec {
  private readonly secret: string;

  constructor(secret: string = process.env.CURSOR_SIGNING_SECRET ?? process.env.JWT_SECRET ?? 'uzima-cursor-dev-secret') {
    this.secret = secret;
  }

  encode(payload: CursorPayload): string {
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return `${body}.${this.sign(body)}`;
  }

  decode(cursor: string): CursorPayload {
    const [body, signature] = cursor.split('.');

    if (!body || !signature) {
      throw new BadRequestApiException('cursor is malformed', { cursor: ['Expected an opaque cursor from a previous response'] });
    }

    if (!this.verify(body, signature)) {
      throw new BadRequestApiException('cursor is not valid', { cursor: ['Cursor failed integrity check'] });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
      throw new BadRequestApiException('cursor is not valid', { cursor: ['Cursor payload is not readable'] });
    }

    const payload = parsed as Partial<CursorPayload>;
    if (typeof payload.f !== 'string' || typeof payload.k !== 'string' || (payload.d !== 'ASC' && payload.d !== 'DESC')) {
      throw new BadRequestApiException('cursor is not valid', { cursor: ['Cursor payload is incomplete'] });
    }

    return payload as CursorPayload;
  }

  private sign(body: string): string {
    return createHmac('sha256', this.secret).update(body).digest('base64url');
  }

  private verify(body: string, signature: string): boolean {
    const expected = this.sign(body);
    // Length check first: timingSafeEqual throws on a length mismatch.
    if (expected.length !== signature.length) {
      return false;
    }
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }
}
