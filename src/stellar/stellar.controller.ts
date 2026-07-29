import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { StellarService } from './stellar.service';
import { XlmPriceService } from './xlm-price.service';
import { CreateStellarDto } from './dto/create-stellar.dto';
import { UpdateStellarDto } from './dto/update-stellar.dto';

@ApiTags('Stellar')
@Controller('stellar')
export class StellarController {
  constructor(
    private readonly stellarService: StellarService,
    private readonly xlmPriceService: XlmPriceService,
  ) {}

  @Get('xlm-price')
  @ApiOperation({ summary: 'Get current XLM price in USD' })
  @ApiResponse({ status: 200, description: 'Current XLM price returned' })
  @ApiResponse({ status: 503, description: 'Price feed unavailable' })
  async getXlmPrice() {
    const price = await this.xlmPriceService.getXlmUsdRate();
    return { priceUsd: price };
  }

  @Post()
  create(@Body() createStellarDto: CreateStellarDto) {
    return this.stellarService.create(createStellarDto);
  }

  @Get()
  findAll() {
    return this.stellarService.findAll();
  }

  @Get('wallet/:address/balance')
  @ApiOperation({ summary: 'Get XLM balance for a Stellar address' })
  @ApiResponse({ status: 200, description: 'Balance returned' })
  @ApiResponse({ status: 400, description: 'Invalid Stellar address' })
  async getWalletBalance(@Param('address') address: string) {
    return this.stellarService.getAccountBalance(address);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.stellarService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateStellarDto: UpdateStellarDto) {
    return this.stellarService.update(+id, updateStellarDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.stellarService.remove(+id);
  }
}
