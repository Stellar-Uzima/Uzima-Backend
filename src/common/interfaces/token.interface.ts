export interface TokenPayload {
  sub: string; // User ID
  email: string;
  roles: string[];
  permissions?: string[];
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface ValidatedToken {
  payload: TokenPayload | null;
  expired: boolean;
  error?: string;
}
