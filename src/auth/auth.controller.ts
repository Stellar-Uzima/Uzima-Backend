import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  ResendEmailVerificationDto,
  VerifyEmailDto,
} from './dto/verify-email.dto';
import { AuthService } from './services/auth.service';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('email/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify email address',
    description:
      "Verify email using the token sent to the user's email address.",
  })
  @ApiResponse({
    status: 200,
    description: 'Email verified successfully',
    schema: {
      example: {
        message: 'Email verified successfully',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired verification token',
  })
  async verifyEmail(@Body() verifyEmailDto: VerifyEmailDto) {
    return this.authService.verifyEmail(verifyEmailDto);
  }

  @Post('email/resend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resend email verification',
    description:
      'Resend verification email to the provided email address. Rate limited to 3 requests per hour.',
  })
  @ApiResponse({
    status: 200,
    description: 'Verification email sent successfully',
    schema: {
      example: {
        message: 'Verification email sent',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Email already verified or rate limit exceeded',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async resendEmailVerification(
    @Body() resendEmailVerificationDto: ResendEmailVerificationDto,
  ) {
    return this.authService.resendEmailVerification(resendEmailVerificationDto);
  }
}
