import { Controller, Get, Patch, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { HealthProfileService } from './health-profile.service';
import { UpdateHealthProfileDto } from './dto/health-profile.dto';
import { HealthProfileCompletionDto } from './dto/health-profile-completion.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard)
export class HealthProfileController {
  constructor(private readonly profileService: HealthProfileService) {}

  @Patch('me/health-profile')
  @ApiOperation({ summary: 'Update current user health profile' })
  @ApiResponse({ status: 200, description: 'Health profile updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updateProfile(@Req() req, @Body() dto: UpdateHealthProfileDto) {
    const userId = req.user.id;
    return this.profileService.updateProfile(userId, dto);
  }

  @Get('health-profile/completion')
  @ApiOperation({ summary: 'Get health profile completion score' })
  async getCompletion(@Req() req): Promise<HealthProfileCompletionDto> {
    const userId = req.user.id ?? req.user.sub;
    return this.profileService.getCompletionScore(userId);
  }
}
