import { Module } from '@nestjs/common';
import { CouponReportController } from './coupon-report.controller';
import { CouponReportService } from './coupon-report.service';

@Module({
  controllers: [CouponReportController],
  providers: [CouponReportService],
})
export class CouponReportModule {}