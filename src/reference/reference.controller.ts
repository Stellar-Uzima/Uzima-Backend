import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ReferenceService } from './reference.service';
import { Country } from './data/african-countries';
import { Language } from './data/supported-languages';

@ApiTags('Reference Data')
@Controller('reference')
export class ReferenceController {
  constructor(private readonly referenceService: ReferenceService) {}

  @Get('countries')
  @ApiOperation({
    summary: 'Get all African countries',
    description:
      'Returns a list of all 54 African countries with ISO codes and flag emojis. Data is cached for 1 hour.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of African countries retrieved successfully',
    schema: {
      example: [
        {
          code: 'KE',
          name: 'Kenya',
          flag: '🇰🇪',
        },
        {
          code: 'NG',
          name: 'Nigeria',
          flag: '🇳🇬',
        },
      ],
    },
  })
  async getCountries(): Promise<Country[]> {
    return this.referenceService.getCountries();
  }

  @Get('languages')
  @ApiOperation({
    summary: 'Get all supported languages',
    description:
      'Returns a list of supported languages including English, French, Arabic, and major African languages. Data is cached for 1 hour. Arabic includes rtl: true flag for right-to-left rendering.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of supported languages retrieved successfully',
    schema: {
      example: [
        {
          code: 'en',
          name: 'English',
          nativeName: 'English',
        },
        {
          code: 'ar',
          name: 'Arabic',
          nativeName: 'العربية',
          rtl: true,
        },
        {
          code: 'sw',
          name: 'Swahili',
          nativeName: 'Kiswahili',
        },
      ],
    },
  })
  async getLanguages(): Promise<Language[]> {
    return this.referenceService.getLanguages();
  }
}
