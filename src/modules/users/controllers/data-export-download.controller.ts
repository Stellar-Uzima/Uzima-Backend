import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { DataExportService } from '../services/data-export.service';

@ApiTags('users')
@Controller('users/data-export')
export class DataExportDownloadController {
  constructor(private readonly dataExportService: DataExportService) {}

  @Get('download')
  @ApiOperation({
    summary: 'Download GDPR export (token from email, expires in 24h)',
  })
  async download(
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    if (!token) {
      throw new BadRequestException('Download token is required');
    }

    const { content, exportId } =
      await this.dataExportService.readExportFile(token);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="uzima-export-${exportId}.json"`,
    );
    res.send(content);
  }
}
