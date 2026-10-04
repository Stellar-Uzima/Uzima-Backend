import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
  Version,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { UpdateMeProfileDto } from '../dto/update-me-profile.dto';
import { MeProfileResponse, MeProfileService } from '../services/me-profile.service';

interface AuthenticatedRequest {
  user?: { sub?: string; id?: string; userId?: string } | null;
}

/** Swagger schema for the self-service profile payload. */
export class MeProfileResponseDto implements MeProfileResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'email' })
  email: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty({ description: 'Derived from firstName + lastName' })
  fullName: string;

  @ApiProperty({ nullable: true, example: '+2348012345678' })
  phoneNumber: string | null;

  @ApiProperty({ nullable: true, example: 'https://cdn.example.com/a.png' })
  avatar: string | null;

  @ApiProperty({ enum: ['USER', 'HEALER', 'SUPPORT', 'ADMIN'] })
  role: string;

  @ApiProperty({ enum: ['active', 'inactive', 'suspended'] })
  status: string;

  @ApiProperty()
  isVerified: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}

/**
 * Self-service profile endpoints (#1290).
 *
 * Mounted on its own controller rather than folded into `UsersController` so the
 * "own profile only" contract is enforced by construction: there is no
 * `:id` parameter here, so there is no way to address another account.
 *
 * `forbidNonWhitelisted: true` is what implements the "sensitive fields cannot
 * be modified" rule — attempts to set `role`, `status`, `isVerified`,
 * `password`, etc. come back as 400 with the offending property named.
 */
@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'users/me/profile' })
@Version('1')
export class MeProfileController {
  constructor(private readonly meProfileService: MeProfileService) {}

  @Get()
  @ApiOperation({
    summary: 'Get the authenticated user profile',
    description:
      'Returns the profile of the caller only. No identifier is accepted, so this ' +
      'endpoint cannot be used to read another account.',
  })
  @ApiResponse({ status: 200, description: 'Profile returned', type: MeProfileResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  @ApiResponse({ status: 404, description: 'Account no longer exists' })
  async getMe(@Req() req: AuthenticatedRequest): Promise<MeProfileResponse> {
    return this.meProfileService.getMe(this.extractUserId(req));
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  @ApiOperation({
    summary: 'Update the authenticated user profile',
    description:
      'Updates firstName, lastName, phoneNumber and/or avatar. Changes are persisted ' +
      'immediately and the response is the freshly read row, so the returned values ' +
      'are exactly what was stored. Any other property is rejected with 400.',
  })
  @ApiResponse({ status: 200, description: 'Profile updated', type: MeProfileResponseDto })
  @ApiResponse({ status: 400, description: 'Validation failed, or a protected field was supplied' })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  @ApiResponse({ status: 404, description: 'Account no longer exists' })
  @ApiResponse({ status: 409, description: 'Phone number already belongs to another account' })
  async updateMe(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateMeProfileDto,
  ): Promise<MeProfileResponse> {
    return this.meProfileService.updateMe(this.extractUserId(req), dto);
  }

  private extractUserId(req: AuthenticatedRequest): string {
    const userId = req.user?.sub ?? req.user?.id ?? req.user?.userId;
    if (!userId) {
      throw new BadRequestException('Authenticated user context is missing');
    }
    return userId;
  }
}
