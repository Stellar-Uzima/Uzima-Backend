import {
    BadRequestException,
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Put,
    Req,
    UseGuards,
    UsePipes,
    ValidationPipe,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiOperation,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { UsersService } from '../users.service';
import {
    UpdateUserSettingsDto,
    UserSettingsResponseDto,
} from '../dto/user-settings.dto';

type AuthenticatedRequest = Request & {
    user?: {
        id?: string;
        sub?: string;
        userId?: string;
    };
};

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users/settings')
export class SettingsController {
    constructor(private readonly usersService: UsersService) { }

    @Get()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Get current user settings' })
    @ApiResponse({
        status: 200,
        description: 'User settings retrieved successfully',
        type: UserSettingsResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: 'Authenticated user context is missing',
    })
    @ApiResponse({
        status: 401,
        description: 'Unauthorized',
    })
    @ApiResponse({
        status: 404,
        description: 'User not found',
    })
    async getSettings (
        @Req() req: AuthenticatedRequest,
    ): Promise<UserSettingsResponseDto> {
        return this.usersService.getSettings(this.extractUserId(req));
    }

    @Put()
    @HttpCode(HttpStatus.OK)
    @UsePipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }),
    )
    @ApiOperation({ summary: 'Update current user settings' })
    @ApiResponse({
        status: 200,
        description: 'User settings updated successfully',
        type: UserSettingsResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: 'Validation failed or authenticated user context is missing',
    })
    @ApiResponse({
        status: 401,
        description: 'Unauthorized',
    })
    @ApiResponse({
        status: 404,
        description: 'User not found',
    })
    async updateSettings (
        @Req() req: AuthenticatedRequest,
        @Body() dto: UpdateUserSettingsDto,
    ): Promise<UserSettingsResponseDto> {
        return this.usersService.updateSettings(this.extractUserId(req), dto);
    }

    private extractUserId (req: AuthenticatedRequest): string {
        const userId = req.user?.id ?? req.user?.sub ?? req.user?.userId;

        if (!userId) {
            throw new BadRequestException('Authenticated user context is missing');
        }

        return userId;
    }
}