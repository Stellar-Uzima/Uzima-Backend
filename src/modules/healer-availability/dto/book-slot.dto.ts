import { IsUUID, IsOptional, IsString, IsBoolean, IsDateString } from 'class-validator';

export class BookSlotDto {
  @IsUUID()
  slotId: string;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  sendReminder?: boolean;
}

export class CancelBookingDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  refundRequested?: boolean;
}

export class BlockDateDto {
  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
