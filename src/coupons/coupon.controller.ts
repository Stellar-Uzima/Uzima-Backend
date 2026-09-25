import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
  Put,
  Param,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { Roles } from '@modules/auth/decorators/roles.decorator';
import { Role } from '@modules/auth/enums/role.enum';
import { Coupon, CouponStatus } from './entities/coupon.entity';
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

  @Get('available')
  @ApiOperation({
    summary: 'Get all available (non-expired, non-redeemed) coupons',
    description: 'Returns coupons that are currently valid for the authenticated user.',
  })
  @ApiResponse({ status: 200, description: 'List of available coupons' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getAvailable(@Req() req: AuthenticatedRequest): Promise<Coupon[]> {
    return this.couponService.getActiveForUser(req.user.sub);
  }

  @Get('me')
  @ApiOperation({
    summary: "Get current user's active coupons",
    description:
      "Returns the authenticated user's active (non-expired) coupons.",
  })
  @ApiResponse({ status: 200, description: 'List of active coupons' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMyCoupons(@Req() req: AuthenticatedRequest): Promise<Coupon[]> {
    return this.couponService.getActiveForUser(req.user.sub);
  }

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

  // ========== Admin Endpoints ==========

  @Post('admin/create')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '[ADMIN] Create a coupon for a specific user' })
  @ApiResponse({ status: 201, description: 'Coupon created', type: Coupon })
  @ApiResponse({ status: 403, description: 'Forbidden: requires ADMIN role' })
  async createCoupon(
    @Body() dto: { userId: string; discount?: number; specialistType?: string; daysValid?: number },
  ): Promise<Coupon> {
    return this.couponService.createCoupon(dto.userId, {
      discount: dto.discount,
      specialistType: dto.specialistType,
      daysValid: dto.daysValid,
    });
  }

  @Post('admin/bulk-create')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '[ADMIN] Bulk create coupons for multiple users' })
  @ApiResponse({ status: 201, description: 'Coupons created', type: [Coupon] })
  @ApiResponse({ status: 403, description: 'Forbidden: requires ADMIN role' })
  async bulkCreateCoupons(
    @Body() dto: { userIds: string[]; discount?: number; specialistType?: string; daysValid?: number },
  ): Promise<Coupon[]> {
    return this.couponService.bulkCreateCoupons(dto.userIds, {
      discount: dto.discount,
      specialistType: dto.specialistType,
      daysValid: dto.daysValid,
    });
  }

  @Get('admin/analytics')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Get coupon usage analytics' })
  @ApiResponse({ status: 200, description: 'Coupon analytics' })
  @ApiResponse({ status: 403, description: 'Forbidden: requires ADMIN role' })
  async getCouponAnalytics() {
    return this.couponService.getCouponAnalytics();
  }

  @Post('admin/:code/redeem')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[ADMIN] Manually mark a coupon as redeemed' })
  @ApiParam({ name: 'code', description: 'Coupon code' })
  @ApiResponse({ status: 200, description: 'Coupon marked as redeemed', type: Coupon })
  @ApiResponse({ status: 403, description: 'Forbidden: requires ADMIN role' })
  @ApiResponse({ status: 404, description: 'Coupon not found' })
  async markAsRedeemed(@Param('code') code: string, @Req() req: AuthenticatedRequest): Promise<Coupon> {
    return this.couponService.markAsRedeemed(code, req.user.sub);
  }

  @Put('admin/:code/extend')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Extend coupon expiration' })
  @ApiParam({ name: 'code', description: 'Coupon code' })
  @ApiResponse({ status: 200, description: 'Coupon expiration extended', type: Coupon })
  @ApiResponse({ status: 403, description: 'Forbidden: requires ADMIN role' })
  @ApiResponse({ status: 404, description: 'Coupon not found' })
  async extendExpiration(
    @Param('code') code: string,
    @Body() dto: { days: number },
  ): Promise<Coupon> {
    return this.couponService.extendExpiration(code, dto.days);
  }
}
