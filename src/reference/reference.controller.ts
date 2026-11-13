import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ReferenceService } from './reference.service';
import { Country } from './data/african-countries';
import { Language } from './data/supported-languages';

// Groups these endpoints under "Reference Data" in the Swagger documentation.
@ApiTags('Reference Data')
// Sets the base route for all endpoints in this controller to /reference.
@Controller('reference')
export class ReferenceController {
  // Inject ReferenceService to handle fetching and caching reference data.
  // Keeping this logic in the service keeps the controller focused on HTTP requests.
  constructor(private readonly referenceService: ReferenceService) {}

  // Handles GET /reference/countries requests.
  @Get('countries')
  @ApiOperation({
    summary: 'Get all African countries',
    description:
      'Returns a list of all 54 African countries with ISO codes and flag emojis. Data is cached for 1 hour.',
  })
  // Documents the successful response and its expected structure in Swagger.
  @ApiResponse({
    status: 200,
    description: 'List of African countries retrieved successfully',
    schema: {
      // Example response displayed in the Swagger UI.
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
  // Returns the list of countries provided by ReferenceService.
  // The Promise resolves to an array of Country objects.
  async getCountries(): Promise<Country[]> {
    return this.referenceService.getCountries();
  }

  // Handles GET /reference/languages requests.
  @Get('languages')
  @ApiOperation({
    summary: 'Get all supported languages',
    description:
      'Returns a list of supported languages including English, French, Arabic, and major African languages. Data is cached for 1 hour. Arabic includes rtl: true flag for right-to-left rendering.',
  })
  // Documents the successful response and its expected structure in Swagger.
  @ApiResponse({
    status: 200,
    description: 'List of supported languages retrieved successfully',
    schema: {
      // Example response illustrating language codes, display names,
      // native names, and the optional right-to-left (rtl) property.
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
  // Returns the supported languages provided by ReferenceService.
  // The Promise resolves to an array of Language objects.
  async getLanguages(): Promise<Language[]> {
    return this.referenceService.getLanguages();
  }
}
