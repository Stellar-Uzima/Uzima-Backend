import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { PushPlatform } from '../entities/push-subscription.entity';

export class RegisterPushSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  deviceToken: string;

  @IsEnum(PushPlatform)
  platform: PushPlatform;
}
