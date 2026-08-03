import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationTypeEnum } from '../entities/in-app-notification.entity';

export class SendNotificationDto {
  @ApiProperty({ description: 'Target user ID', example: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ enum: NotificationTypeEnum, example: NotificationTypeEnum.TASK_REMINDER })
  @IsEnum(NotificationTypeEnum)
  type: NotificationTypeEnum;

  @ApiProperty({ example: 'Task due soon' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Your task "Morning Walk" is due within 24 hours.' })
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiPropertyOptional({ description: 'Arbitrary JSON payload attached to the notification' })
  @IsOptional()
  @IsObject()
  data?: Record<string, any>;
}
