import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  // TODO: Implement authentication methods
  // - register(email: string, password: string, phone: string)
  // - login(email: string, password: string)
  // - validateUser(email: string, password: string)
  // - generateToken(userId: string)
  // - refreshToken(refreshToken: string)
  // - validateToken(token: string)
}
