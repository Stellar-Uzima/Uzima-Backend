import { BadRequestException, Controller, Get, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { DataExportService, DataExportRequester } from '../services/data-export.service';
import { Role } from '@modules/auth/enums/role.enum';

type DownloadRequest = {
  user?: {
    id?: string;
    sub?: string;
    userId?: string;
    role?: Role;
  } | null;
  headers?: { [k: string]: any };
  ip?: string;
  connection?: { remoteAddress?: string };
  socket?: { remoteAddress?: string };
  apiKey?: { scopes?: string[]; user?: any };
};

@ApiTags('users')
@Controller('users/data-export')
export class DataExportDownloadController {
  constructor(private readonly dataExportService: DataExportService) {}

  @Get('download')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Download GDPR export (token from email, expires in 24h)',
    description:
      'Downloads a data export using a short-lived token. ' +
      'Authenticated users may download their own exports directly; admins ' +
      'or service accounts with export scopes may download any export. ' +
      'Unauthenticated downloads are permitted only for valid emailed tokens ' +
      'and are written to the compliance audit log. Authentication is optional; ' +
      'the download token itself is the primary authorization.',
  })
  @ApiQuery({
    name: 'token',
    description: 'Download token received via ready-to-download notification',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'Export file returned as attachment' })
  @ApiResponse({ status: 400, description: 'Missing token' })
  @ApiResponse({ status: 403, description: 'Not authorized for this export' })
  @ApiResponse({ status: 404, description: 'Token invalid or expired' })
  async download(@Query('token') token: string, @Res() res: Response, @Req() req: DownloadRequest) {
    if (!token) {
      throw new BadRequestException('Download token is required');
    }

    let downloader: DataExportRequester | undefined;
    const user = req.user;
    const hasAuth = !!(user?.id || user?.sub || user?.userId);
    if (hasAuth) {
      const userId = (user?.id ?? user?.sub ?? user?.userId) as string;
      const ip = req.ip || req.headers?.['x-forwarded-for']?.toString()?.split(',')[0]?.trim();
      downloader = {
        kind: req.apiKey ? 'service' : 'user',
        userId,
        role: user?.role,
        scopes: req.apiKey?.scopes,
        ipAddress: ip,
        userAgent: req.headers?.['user-agent'] as string | undefined,
        requestId: req.headers?.['x-request-id'] as string | undefined,
      };
    }

    const { content, exportId } = await this.dataExportService.readExportFile(token, downloader);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="uzima-export-${exportId}.json"`);
    res.send(content);
  }
}
