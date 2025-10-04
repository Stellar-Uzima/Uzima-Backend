import express from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import { swaggerAuthMiddleware } from './middleware/swagger-auth';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Swagger definition
const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Your API Documentation',
      version: '1.0.0',
      description: 'Comprehensive API documentation with all endpoints',
      contact: {
        name: 'API Support',
        email: 'support@example.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
      {
        url: 'https://staging-api.example.com',
        description: 'Staging server',
      },
      {
        url: 'https://api.example.com',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT token',
        },
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-KEY',
          description: 'API Key for external integrations',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            statusCode: {
              type: 'integer',
              example: 400,
            },
            message: {
              type: 'string',
              example: 'Validation failed',
            },
            errors: {
              type: 'array',
              items: {
                type: 'string',
              },
              example: ['email must be valid'],
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-15T10:30:00Z',
            },
            path: {
              type: 'string',
              example: '/api/users',
            },
          },
        },
      },
    },
    tags: [
      {
        name: 'Users',
        description: 'User management endpoints',
      },
      {
        name: 'Auth',
        description: 'Authentication and authorization',
      },
      {
        name: 'Products',
        description: 'Product CRUD operations',
      },
    ],
  },
  apis: [
    './src/routes/*.ts',
    './src/routes/*.js',
    './src/controllers/*.ts',
    './src/controllers/*.js',
    './src/models/*.ts',
    './src/models/*.js',
  ],
};

// Generate OpenAPI spec
const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Secure Swagger UI in production
if (process.env.NODE_ENV === 'production') {
  app.use('/docs', swaggerAuthMiddleware);
}

// Serve Swagger UI
app.use(
  '/docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'API Documentation',
    customfavIcon: 'https://example.com/favicon.ico',
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
      showRequestDuration: true,
      displayRequestDuration: true,
      syntaxHighlight: {
        activate: true,
        theme: 'monokai',
      },
    },
  })
);

// Serve raw OpenAPI JSON
app.get('/docs-json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Import routes
import userRoutes from './routes/users';
import authRoutes from './routes/auth';

app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    statusCode: 404,
    message: 'Route not found',
    path: req.path,
  });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    statusCode: err.status || 500,
    message: err.message || 'Internal server error',
    timestamp: new Date().toISOString(),
    path: req.path,
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📚 API Docs available at http://localhost:${PORT}/docs`);
  console.log(`📄 OpenAPI spec at http://localhost:${PORT}/docs-json`);
});

export default app;