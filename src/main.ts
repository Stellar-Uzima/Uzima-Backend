import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { CsrfMiddleware } from './common/middleware/csrf.middleware';

// Security headers middleware
function addSecurityHeaders(req, res, next) {
  // HSTS (HTTP Strict Transport Security)
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  
  // X-Frame-Options to prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // X-Content-Type-Options to prevent MIME-type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Content Security Policy
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://www.gstatic.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self' https://api.stellar.org https://horizon-testnet.stellar.org; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self';"
  );
  
  // Additional security headers
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  next();
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Apply security headers middleware
  app.use(addSecurityHeaders);

  // Apply CSRF middleware
  const csrfMiddleware = new CsrfMiddleware();
  app.use((req, res, next) => csrfMiddleware.use(req, res, next));

  // Global validation pipe
  app.useGlobalPipes(
    new CustomValidationPipe(),
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global logging interceptor
  const loggingInterceptor = app.get(LoggingInterceptor);
  app.useGlobalInterceptors(loggingInterceptor);

  // Enable CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Stellar Uzima API')
    .setDescription(
      'Healthcare & Financial Inclusion through Blockchain for African Communities',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .addTag('health', 'Health monitoring endpoints')
    .addTag('auth', 'Authentication endpoints')
    .addTag('users', 'User management endpoints')
    .addTag('tasks', 'Health tasks endpoints')
    .addTag('wallet', 'Wallet and blockchain endpoints')
    .addTag('consultations', 'Consultation booking endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.APP_PORT || 3001;
  await app.listen(port);

  console.log(`🚀 Stellar Uzima Backend running on http://localhost:${port}`);
  console.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
}

bootstrap();
