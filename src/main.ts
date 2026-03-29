import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { validateEnv } from './config/env.validation';

async function bootstrap() {
  // Fail fast: validate all required environment variables before app starts
  validateEnv();

  const app = await NestFactory.create(AppModule);

  // Enable Nest's shutdown hooks so OnApplicationShutdown is triggered
  app.enableShutdownHooks();

  // Register global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Enable global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // Configure Swagger (disabled in production)
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Stellar Uzima API')
      .setDescription(
        'Uzima Backend API - Phone OTP Authentication and User Management',
      )
      .setVersion('1.0.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'Authorization',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth', // This is the key name for the security scheme
      )
      .addTag('Authentication', 'Phone OTP authentication endpoints')
      .addTag('Users', 'User profile management endpoints')
      .addTag('Health', 'Health check endpoints')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'list',
        filter: true,
        showRequestDuration: true,
      },
      customSiteTitle: 'Stellar Uzima API Docs',
    });

    console.log(
      `Swagger UI available at: http://localhost:${process.env.PORT ?? 3000}/api/docs`,
    );
  }

  const server = await app.listen(process.env.PORT ?? 3000);

  // Handle SIGTERM for graceful shutdown with a 30s hard timeout
  process.once('SIGTERM', async () => {
    console.log('SIGTERM received: starting graceful shutdown');

    // Stop accepting new connections if possible
    try {
      const httpServer = (app.getHttpServer && app.getHttpServer()) as any;
      if (httpServer && typeof httpServer.close === 'function') {
        httpServer.close(() => console.log('Stopped accepting new connections'));
      }
    } catch (e) {
      console.warn('Error while closing http server:', (e as Error).message);
    }

    const forceTimeout = setTimeout(() => {
      console.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, 30000);

    try {
      await app.close();
      clearTimeout(forceTimeout);
      console.log('Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      console.error('Error during graceful shutdown:', (err as Error).message);
      process.exit(1);
    }
  });
}
bootstrap();
