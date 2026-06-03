import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { CsrfMiddleware } from './common/middleware/csrf.middleware';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { MonitoringInterceptor } from './common/interceptors/monitoring.interceptor';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { parseCorsOrigins } from './config/app.config';

// Security headers middleware
function addSecurityHeaders(req, res, next) {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
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
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // API Versioning
  app.enableVersioning({
    type: VersioningType.URI,
    prefix: 'api/v',
    defaultVersion: '1',
  });

  app.use(addSecurityHeaders);
  
  const csrfMiddleware = new CsrfMiddleware();
  app.use((req, res, next) => csrfMiddleware.use(req, res, next));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());

  const loggingInterceptor = app.get(LoggingInterceptor);
  app.useGlobalInterceptors(loggingInterceptor);
  app.useGlobalInterceptors(new TransformInterceptor());
  
  const monitoringInterceptor = app.get(MonitoringInterceptor);
  app.useGlobalInterceptors(monitoringInterceptor);

  const corsOrigins = parseCorsOrigins(process.env);
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS origin not allowed: ${origin}`), false);
    },
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('Stellar Uzima API')
    .setDescription('Healthcare & Financial Inclusion through Blockchain for African Communities')
    .setVersion('1.0.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      name: 'Authorization',
      description: 'Enter your JWT access token (without the "Bearer " prefix).',
      in: 'header',
    })
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