import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { CouponStatus } from '../../entities/coupon.entity';

export class CouponValueOptionsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  discount?: number;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  specialistType?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  daysValid?: number;
}

export class CouponOptionsDto extends CouponValueOptionsDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9]{8}$/)
  code?: string;
}

export class CreateCouponDto extends CouponOptionsDto {
  @IsUUID()
  userId: string;
}

export class BulkCreateCouponsDto extends CouponValueOptionsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  userIds: string[];
}

export class UpdateCouponStatusDto {
  @IsEnum(CouponStatus)
  status: CouponStatus;
}

export class ExtendCouponDto {
  @IsInt()
  @Min(1)
  @Max(365)
  days: number;
}
