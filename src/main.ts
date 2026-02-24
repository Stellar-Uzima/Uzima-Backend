import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
