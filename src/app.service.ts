import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  getWelcome() {
    return {
      name: 'Stellar Uzima Backend API',
      version: '1.0.0',
      description: 'Healthcare & Financial Inclusion through Blockchain for African Communities',
      docs: '/api/docs',
    };
  }
}
