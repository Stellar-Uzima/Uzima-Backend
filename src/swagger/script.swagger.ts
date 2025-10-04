// scripts/generate-swagger.ts
import swaggerJsdoc from 'swagger-jsdoc';
import fs from 'fs';
import path from 'path';

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
        },
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-KEY',
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
              example: 'Error message',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
            },
            path: {
              type: 'string',
            },
          },
        },
      },
    },
    tags: [
      { name: 'Users', description: 'User management' },
      { name: 'Auth', description: 'Authentication' },
      { name: 'Products', description: 'Product operations' },
    ],
  },
  apis: [
    './src/routes/*.ts',
    './src/routes/*.js',
    './src/controllers/*.ts',
    './src/controllers/*.js',
  ],
};

async function generateSwaggerSpec(): Promise<void> {
  console.log('🚀 Starting OpenAPI spec generation...\n');

  try {
    // Generate the spec
    const swaggerSpec = swaggerJsdoc(swaggerOptions);

    // Validate that we have content
    if (!swaggerSpec.paths || Object.keys(swaggerSpec.paths).length === 0) {
      console.warn('⚠️  Warning: No API paths found in the specification');
    }

    // Save to file
    const outputPath = path.resolve(process.cwd(), 'swagger-spec.json');
    fs.writeFileSync(outputPath, JSON.stringify(swaggerSpec, null, 2), {
      encoding: 'utf8',
    });

    console.log('✅ OpenAPI spec generated successfully!');
    console.log(`📄 File saved to: ${outputPath}\n`);

    // Print statistics
    const pathCount = Object.keys(swaggerSpec.paths || {}).length;
    const schemaCount = swaggerSpec.components?.schemas
      ? Object.keys(swaggerSpec.components.schemas).length
      : 0;
    const tagCount = swaggerSpec.tags?.length || 0;

    console.log('📊 Specification Statistics:');
    console.log(`   ├─ API Version: ${swaggerSpec.info.version}`);
    console.log(`   ├─ Endpoints: ${pathCount}`);
    console.log(`   ├─ Schemas: ${schemaCount}`);
    console.log(`   ├─ Tags: ${tagCount}`);
  }catch{
    console.log();
    
  }