import { PartialType } from '@nestjs/mapped-types';
import { CreateStellarDto } from './create-stellar.dto';

export class UpdateStellarDto extends PartialType(CreateStellarDto) {}
