import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CouponService, ValidateCouponResult } from './coupon.service';
import { ValidateCouponDto } from './dto/validate-coupon.dto';

interface AuthenticatedRequest extends Request {
  user: { sub: string; email?: string; role?: string };
}

@ApiTags('Coupons')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('coupons')
export class CouponController {
  constructor(private readonly couponService: CouponService) {}

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  @ApiOperation({
    summary: 'Validate coupon',
    description:
      'Validate a coupon before confirming a consultation booking. Does not mark the coupon as used. Rate limited to 10 attempts per coupon per hour.',
  })
  @ApiResponse({
    status: 200,
    description: 'Validation result',
    schema: {
      example: { valid: true },
      properties: {
        valid: { type: 'boolean' },
        reason: { type: 'string', description: 'Present when valid is false' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request body',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Coupon belongs to a different user',
  })
  async validate(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ValidateCouponDto,
  ): Promise<ValidateCouponResult> {
    return this.couponService.validate(dto, req.user.sub);
  }
}
