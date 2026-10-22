import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();
    // beforeEach(async () => {
    //   const app: TestingModule = await Test.createTestingModule({
    //     controllers: [AppController],
    //     providers: [AppService],
    //   }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('should return welcome message', () => {
    expect(appController.getWelcome()).toEqual({
      name: 'Stellar Uzima Backend API',
      version: '1.0.0',
      description: 'Healthcare & Financial Inclusion through Blockchain for African Communities',
      docs: '/api/docs',
    });
  });
});
