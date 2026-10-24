import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'; // REPLACE with the real guard path
import { RolesGuard } from '../../../common/guards/roles.guard'; // REPLACE
import { Roles } from '../../../common/decorators/roles.decorator'; // REPLACE
import { CouponReportQueryDto } from './coupon-report-query.dto';
import { CouponReportService } from './coupon-report.service';

// REPLACE the path/version style with the one other controllers use (e.g. versioning options).
@Controller('coupons/reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin') // REPLACE with the repo's real admin role value
export class CouponReportController {
  constructor(private readonly reports: CouponReportService) {}

  @Get('usage')
  usage(@Query() query: CouponReportQueryDto) {
    return this.reports.usage(query);
  }
}