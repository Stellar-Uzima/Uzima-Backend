import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  ForbiddenException,
  NotFoundException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UserResponseDto } from '../../../users/dto/user-response.dto';
import { plainToInstance } from 'class-transformer';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../../entities/user.entity';

// Minimal Auth types & guard (copied from canonical controller)
interface AuthenticatedRequest extends Request {
  user: { userId: string; role?: string };
}
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
class JwtAuthGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    request.user = { userId: 'mock-user-id' }; // mock - replace with real JWT in prod
    return true;
  }
}

@ApiTags('users')
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all users' })
  async findAll() {
    // TODO: Implement get all users with pagination
    return { message: 'Get all users logic to be implemented' };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  async findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isOwner = req.user.userId === id;
    const isAdmin = req.user.role === 'ADMIN';

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException('Forbidden');
    }

    // Return sanitized response
    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update user profile' })
  async update(@Param('id') id: string, @Body() body: any) {
    // TODO: Implement update user
    return { message: 'Update user logic to be implemented' };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete user account' })
  async delete(@Param('id') id: string) {
    // TODO: Implement delete user
    return { message: 'Delete user logic to be implemented' };
  }

  @Get(':id/profile')
  @ApiOperation({ summary: 'Get user profile with stats' })
  async getProfile(@Param('id') id: string) {
    // TODO: Implement get profile with stats (tasks completed, earnings, etc.)
    return { message: 'Get profile logic to be implemented' };
  }
}
