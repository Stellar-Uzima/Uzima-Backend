import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject, IsBoolean } from 'class-validator';

export class NameTranslationsDto {
    @ApiProperty({ example: 'Nutrition' })
    @IsString()
    en: string;

    @ApiPropertyOptional({ example: 'Nutrition' })
    @IsOptional()
    @IsString()
    fr?: string;

    @ApiPropertyOptional({ example: 'Lishe' })
    @IsOptional()
    @IsString()
    sw?: string;

    @ApiPropertyOptional({ example: 'Abinci Mai Gina Jiki' })
    @IsOptional()
    @IsString()
    ha?: string;

    @ApiPropertyOptional({ example: 'Ounjẹ' })
    @IsOptional()
    @IsString()
    yo?: string;

    @ApiPropertyOptional({ example: 'Nri' })
    @IsOptional()
    @IsString()
    ig?: string;

    @ApiPropertyOptional({ example: 'አመጋገብ' })
    @IsOptional()
    @IsString()
    am?: string;

    @ApiPropertyOptional({ example: 'تغذية' })
    @IsOptional()
    @IsString()
    ar?: string;

    @ApiPropertyOptional({ example: 'Nutrição' })
    @IsOptional()
    @IsString()
    pt?: string;

    @ApiPropertyOptional({ example: 'Ukudla' })
    @IsOptional()
    @IsString()
    zu?: string;

    @ApiPropertyOptional({ example: 'Ukutya' })
    @IsOptional()
    @IsString()
    xh?: string;

    @ApiPropertyOptional({ example: 'Nafaqo' })
    @IsOptional()
    @IsString()
    so?: string;
}

export class CreateCategoryDto {
    @ApiProperty({ example: 'Nutrition' })
    @IsString()
    name: string;

    @ApiProperty({ type: NameTranslationsDto })
    @IsObject()
    nameTranslations: NameTranslationsDto;

    @ApiPropertyOptional({ example: 'nutrition-icon' })
    @IsOptional()
    @IsString()
    icon?: string;

    @ApiPropertyOptional({ example: '#4CAF50' })
    @IsOptional()
    @IsString()
    color?: string;
}

export class UpdateCategoryDto {
    @ApiPropertyOptional({ example: 'Nutrition' })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional({ type: NameTranslationsDto })
    @IsOptional()
    @IsObject()
    nameTranslations?: NameTranslationsDto;

    @ApiPropertyOptional({ example: 'nutrition-icon' })
    @IsOptional()
    @IsString()
    icon?: string;

    @ApiPropertyOptional({ example: '#4CAF50' })
    @IsOptional()
    @IsString()
    color?: string;

    @ApiPropertyOptional({ example: true })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}

export class CategoryResponseDto {
    @ApiProperty()
    id: string;

    @ApiProperty()
    name: string;

    @ApiProperty({ type: NameTranslationsDto })
    nameTranslations: NameTranslationsDto;

    @ApiPropertyOptional()
    icon?: string;

    @ApiPropertyOptional()
    color?: string;

    @ApiProperty()
    isActive: boolean;

    @ApiProperty()
    createdAt: Date;

    @ApiProperty()
    updatedAt: Date;
}