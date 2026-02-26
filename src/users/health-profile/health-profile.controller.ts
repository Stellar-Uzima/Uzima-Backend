import { Controller, Patch, Body, UseGuards, Req } from '@nestjs/common';
import { HealthProfileService } from './health-profile.service';
import { UpdateHealthProfileDto } from './dto/health-profile.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard'; // adjust path as needed

@Controller('users/me/health-profile')
export class HealthProfileController {
  constructor(private readonly profileService: HealthProfileService) {}

  @UseGuards(JwtAuthGuard)
  @Patch()
  async updateProfile(@Req() req, @Body() dto: UpdateHealthProfileDto) {
    const userId = req.user.id;
    return this.profileService.updateProfile(userId, dto);
  }
}