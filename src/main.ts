import { NestFactory, Reflector } from '@nestjs/core';
import { VersioningType, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { CsrfMiddleware } from './common/middleware/csrf.middleware';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { MonitoringInterceptor } from './common/interceptors/monitoring.interceptor';
import { StandardizedExceptionFilter } from './common/filters/standardized-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { CustomValidationPipe } from './common/pipes/validation.pipe';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { parseCorsOrigins } from './config/app.config';
import { StructuredNestLogger } from './shared/logging/nest-logger.adapter';

// Security headers middleware
function addSecurityHeaders(req, res, next) {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubdomains; preload');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://www.gstatic.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self' https://api.stellar.org https://horyzon-testnet.stellar.org; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self';"
  );
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.useLogger(app.get(StructuredNestLogger));
  
  // Retrieve ConfigService from the application context to safely read environment parameters
  const configService = app.get(ConfigService);

  // API Versioning
  app.enableVersioning({
    type: VersioningType.URI,
    prefix: 'api/v',
    defaultVersion: '1',
  });

  app.use(addSecurityHeaders);
  
  const csrfMiddleware = new CsrfMiddleware();
  app.use((req, res, next) => csrfMiddleware.use(req, res, next));

  app.useGlobalPipes(new CustomValidationPipe());

  // Single global error contract (#1292). The previous filter is retained in
  // the tree for reference but is no longer registered: two global filters
  // would race, and the first one to write the response wins, so clients would
  // see two different error shapes depending on which threw.
  app.useGlobalFilters(new StandardizedExceptionFilter());

  const reflector = app.get(Reflector);
  // Apply RateLimitGuard first to ensure all requests are rate limited before any other processing
  const rateLimitGuard = app.get(RateLimitGuard);
  app.useGlobalGuards(rateLimitGuard, new PermissionsGuard(reflector));

  const loggingInterceptor = app.get(LoggingInterceptor);
  app.useGlobalInterceptors(loggingInterceptor);
  app.useGlobalInterceptors(new TransformInterceptor());
  
  const monitoringInterceptor = app.get(MonitoringInterceptor);
  app.useGlobalInterceptors(monitoringInterceptor);

  // Use ConfigService for CORS parsing or fallback to process environment if needed
  const corsOrigins = parseCorsOrigins(configService.get('CORS_ORIGINS') || process.env);
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
    .setDescription(
      'Healthcare & Financial Inclusion through Blockchain for African Communities. ' +
        'Public HTTP routes use URI versioning and are served under /api/v1 unless explicitly ' +
        'assigned another version. Error responses use the shared ApiErrorResponse envelope.',
    )
    .setVersion('1.0.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      name: 'Authorization',
      description: 'Enter your JWT access token (without the "Bearer" prefix).',
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
  document.components ??= {};
  document.components.schemas ??= {};
  document.components.schemas.ApiErrorResponse = {
    type: 'object',
    required: ['error'],
    properties: {
      error: {
        type: 'object',
        required: ['code', 'message', 'statusCode', 'path', 'method', 'timestamp'],
        properties: {
          code: { type: 'string', description: 'Stable machine-readable error code' },
          message: { type: 'string', description: 'Human-readable error message' },
          statusCode: { type: 'integer', format: 'int32' },
          details: {
            type: 'object',
            additionalProperties: {
              oneOf: [
                { type: 'array', items: { type: 'string' } },
                { type: 'string' },
                { type: 'number' },
                { type: 'boolean' },
              ],
            },
          },
          path: { type: 'string' },
          method: { type: 'string' },
          requestId: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
    },
  };

  const documentedErrorStatuses: Record<string, string> = {
    '400': 'Bad request or DTO validation failed',
    '401': 'Authentication required or credentials invalid',
    '403': 'Authenticated caller is not permitted to perform this operation',
    '404': 'Requested resource was not found',
    '409': 'Request conflicts with the current resource state',
    '410': 'Requested resource is no longer available',
    '422': 'Request is syntactically valid but cannot be processed',
    '423': 'Account is temporarily locked',
    '429': 'Request rate limit exceeded',
    '500': 'Unexpected server error',
    '503': 'Service is temporarily unavailable',
  };
  const httpMethods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;
  for (const pathItem of Object.values(document.paths ?? {})) {
    if (!pathItem || '$ref' in pathItem) {
      continue;
    }
    for (const method of httpMethods) {
      const operation = pathItem[method];
      if (!operation) {
        continue;
      }
      for (const [status, description] of Object.entries(documentedErrorStatuses)) {
        const existing = operation.responses[status];
        if (!existing || '$ref' in existing) {
          operation.responses[status] = { description };
        }
        const response = operation.responses[status];
        if (response && !('$ref' in response)) {
          response.description ||= description;
          response.content = {
            ...response.content,
            'application/json': {
              ...response.content?.['application/json'],
              schema: { $ref: '#/components/schemas/ApiErrorResponse' },
            },
          };
        }
      }
    }
  }
  SwaggerModule.setup('api/docs', app, document);

  // Replace direct process.env reference with configService.get
  const port = configService.get<number>('APP_PORT') || 3001;
  await app.listen(port);

  logger.log(`🍐 Stellar Uzima Backend running on http://localhost:${port}`);
  logger.log(`🌒 API Documentation: http://localhost:${port}/api/docs`);
}
bootstrap();