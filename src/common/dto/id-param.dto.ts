import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class IdParamDto {
  @ApiProperty({
    description: 'The UUID v4 identifier of the resource',
    example: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'id must be a valid UUID v4' })
  id: string;
}
