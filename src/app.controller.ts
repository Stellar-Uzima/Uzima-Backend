import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /**
   * Health check endpoint (`GET /health`).
   *
   * Reports that the service is running, for use by load balancers,
   * container orchestrators and uptime monitors.
   *
   * @returns An object with the service `status` (`'healthy'`), the current
   * ISO-8601 `timestamp`, and the process `uptime` in seconds.
   */
  @Get('health')
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  getHealth() {
    return this.appService.getHealth();
  }
  // beforeEach(async () => {
  //   const app: TestingModule = await Test.createTestingModule({
  //     controllers: [AppController],
  //     providers: [AppService],
  //   }).compile();

  /**
   * Root welcome endpoint (`GET /`).
   *
   * Returns basic information about the API so clients can identify the
   * service and find its documentation.
   *
   * @returns An object with the API `name`, `version`, a short `description`,
   * and the `docs` path of the Swagger documentation.
   */
  @Get()
  @ApiOperation({ summary: 'Welcome message' })
  @ApiResponse({ status: 200, description: 'Welcome message retrieved successfully' })
  getWelcome() {
    return this.appService.getWelcome();
  }
}
