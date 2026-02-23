// src/admin/dto/list-users.dto.ts
import { IsOptional, IsString, IsEnum, IsBooleanString } from 'class-validator';
import { Role } from 'src/auth/enums/role.enum';

export class ListUsersDto {
  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsBooleanString()
  isActive?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
