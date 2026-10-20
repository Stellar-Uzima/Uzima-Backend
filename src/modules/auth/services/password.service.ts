import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class PasswordService {
  // Hash a plain-text password before storing it securely.
  async hashPassword(password: string): Promise<string> {
    // Use 12 salt rounds to increase the computational cost of password hashing.
    return bcrypt.hash(password, 12);
  }

  // Verify a plain-text password against its stored bcrypt hash.
  async comparePassword(password: string, hash: string): Promise<boolean> {
    // Return true if the password matches the hash; otherwise, return false.
    return bcrypt.compare(password, hash);
  }
}
