import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from 'src/auth/enums/role.enum';

export class ChangeRoleDto {
  @ApiProperty({
    description: 'New role for the user',
    enum: Role,
    example: Role.HEALER,
  })
  @IsEnum(Role)
  role: Role;
}
