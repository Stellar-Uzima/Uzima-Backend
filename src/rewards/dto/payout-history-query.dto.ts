import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { RewardHistoryQueryDto } from './reward-history.dto';
import { RewardStatus } from '../enums/reward-status.enum';

export class PayoutHistoryQueryDto extends RewardHistoryQueryDto {
  @ApiPropertyOptional({ enum: RewardStatus })
  @IsOptional()
  @IsEnum(RewardStatus)
  status?: RewardStatus;
}
