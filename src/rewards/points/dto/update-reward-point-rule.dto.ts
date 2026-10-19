import { PartialType } from '@nestjs/swagger';
import { CreateRewardPointRuleDto } from './create-reward-point-rule.dto';

export class UpdateRewardPointRuleDto extends PartialType(
  CreateRewardPointRuleDto,
) {}
