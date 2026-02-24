import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UserStatsDto } from './dto/user-stats.dto';

// JWT Auth Guard - will be implemented when JWT is added
// For now, we'll use a mock guard interface
interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    email?: string;
    phoneNumber?: string;
  };
}

// Mock JWT Guard - replace with actual JwtAuthGuard when JWT is implemented
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
class JwtAuthGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    // TODO: Implement actual JWT verification
    // For now, allow all requests (mock implementation)
    const request = context.switchToHttp().getRequest();
    // Mock user for testing - in production, this comes from JWT token
    request.user = { userId: 'mock-user-id' };
    return true;
  }
}

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get current user profile',
    description: 'Returns the profile of the currently authenticated user.',
  })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token missing or invalid',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async getProfile(@Req() req: AuthenticatedRequest): Promise<UserResponseDto> {
    return this.usersService.getProfile(req.user.userId);
  }

  @Get('me/stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get current user stats',
    description: 'Returns aggregated stats for the dashboard including tasks completed, XLM earned, streak, and active coupons. Results are cached for 5 minutes.',
  })
  @ApiResponse({
    status: 200,
    description: 'User stats retrieved successfully',
    type: UserStatsDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token missing or invalid',
  })
  async getStats(@Req() req: AuthenticatedRequest): Promise<UserStatsDto> {
    return this.usersService.getStats(req.user.userId);
  }

  @Patch('me')
  @HttpCode(HttpStatus.OK)
  @UsePipes(
    new ValidationPipe({
      whitelist: true, // Strip properties that don't have decorators
      forbidNonWhitelisted: false, // Don't throw error for non-whitelisted properties, just strip them
      transform: true,
    }),
  )
  @ApiOperation({
    summary: 'Update current user profile',
    description: 'Update the profile of the currently authenticated user. Only provided fields will be updated.',
  })
  @ApiResponse({
    status: 200,
    description: 'User profile updated successfully',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token missing or invalid',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async updateProfile(
    @Req() req: AuthenticatedRequest,
    @Body() updateProfileDto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    return this.usersService.updateProfile(req.user.userId, updateProfileDto);
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete current user account (soft delete)',
    description: 'Soft deletes the currently authenticated user account. Sets isActive to false and anonymizes email.',
  })
  @ApiResponse({
    status: 204,
    description: 'User account deleted successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token missing or invalid',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async deleteProfile(@Req() req: AuthenticatedRequest): Promise<void> {
    await this.usersService.softDelete(req.user.userId);
  }
}
