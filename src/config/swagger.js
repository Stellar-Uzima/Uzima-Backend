import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Uzima Healthcare Platform API',
      version: '1.0.0',
      description: `
# Uzima Healthcare Platform API

Comprehensive API documentation for the Uzima Healthcare Platform - a blockchain-enabled medical records management system.

## Features
- **User Authentication**: JWT-based authentication with 2FA support
- **Medical Records**: Secure creation, retrieval, and management of patient records
- **Prescriptions**: Digital prescription management with verification
- **Inventory Management**: FIFO-based inventory tracking with lot management
- **GDPR Compliance**: Data export and deletion capabilities
- **Notifications**: Email notification system with queue management

## Authentication
Most endpoints require a valid JWT token. Include the token in the Authorization header:
\`\`\`
Authorization: Bearer <your-jwt-token>
\`\`\`
      `,
      contact: {
        name: 'Uzima Support',
        url: 'https://github.com/Stellar-Uzima/Uzima-Backend',
        email: '',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Development server',
      },
      {
        url: 'https://api.uzima.health',
        description: 'Production server',
      },
    ],
    tags: [
      { name: 'Auth', description: 'Authentication and authorization endpoints' },
      { name: 'Users', description: 'User management operations' },
      { name: 'Records', description: 'Medical records management' },
      { name: 'Prescriptions', description: 'Prescription creation and verification' },
      { name: 'Inventory', description: 'Inventory and stock management' },
      { name: 'Notifications', description: 'Email notification management' },
      { name: 'GDPR', description: 'GDPR compliance - data export and deletion' },
      { name: 'Backups', description: 'Database backup management (Admin)' },
      { name: 'Activity', description: 'Activity logging and audit trails' },
      { name: 'Admin', description: 'Administrative operations' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT token obtained from login',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            message: {
              type: 'string',
              example: 'An error occurred',
            },
            errors: {
              type: 'array',
              items: { type: 'string' },
              example: ['Validation failed'],
            },
          },
        },
        ValidationError: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            message: {
              type: 'string',
              example: 'Validation failed',
            },
            errors: {
              type: 'array',
              items: { type: 'string' },
              example: ['email is required', 'password must be at least 8 characters'],
            },
          },
        },
        UnauthorizedError: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            message: {
              type: 'string',
              example: 'Unauthorized - Invalid or missing token',
            },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: '507f1f77bcf86cd799439011',
            },
            username: {
              type: 'string',
              example: 'johndoe',
            },
            email: {
              type: 'string',
              format: 'email',
              example: 'john.doe@example.com',
            },
            role: {
              type: 'string',
              enum: ['patient', 'doctor', 'educator', 'admin'],
              example: 'patient',
            },
          },
        },
        RegisterRequest: {
          type: 'object',
          required: ['username', 'email', 'password', 'role'],
          properties: {
            username: {
              type: 'string',
              minLength: 3,
              maxLength: 30,
              example: 'johndoe',
              description: 'Unique username',
            },
            email: {
              type: 'string',
              format: 'email',
              example: 'john.doe@example.com',
              description: 'Valid email address',
            },
            password: {
              type: 'string',
              format: 'password',
              minLength: 8,
              example: 'SecureP@ss123',
              description: 'Password (min 8 chars, must contain uppercase, lowercase, number)',
            },
            role: {
              type: 'string',
              enum: ['patient', 'doctor', 'educator', 'admin'],
              example: 'patient',
              description: 'User role',
            },
          },
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              example: 'john.doe@example.com',
            },
            password: {
              type: 'string',
              format: 'password',
              example: 'SecureP@ss123',
            },
          },
        },
        AuthResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            message: {
              type: 'string',
              example: 'Login successful',
            },
            data: {
              type: 'object',
              properties: {
                user: {
                  $ref: '#/components/schemas/User',
                },
                accessToken: {
                  type: 'string',
                  example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                },
                refreshToken: {
                  type: 'string',
                  example: 'a1b2c3d4e5f6...',
                },
              },
            },
          },
        },
        Prescription: {
          type: 'object',
          properties: {
            prescriptionNumber: {
              type: 'string',
              example: 'RX-2024-001234',
            },
            patientId: {
              type: 'string',
              example: '507f1f77bcf86cd799439011',
            },
            doctorId: {
              type: 'string',
              example: '507f1f77bcf86cd799439012',
            },
            medications: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'Amoxicillin' },
                  dosage: { type: 'string', example: '500mg' },
                  frequency: { type: 'string', example: 'twice daily' },
                  duration: { type: 'string', example: '7 days' },
                },
              },
            },
            status: {
              type: 'string',
              enum: ['pending', 'verified', 'rejected', 'dispensed'],
              example: 'pending',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        InventoryItem: {
          type: 'object',
          properties: {
            sku: {
              type: 'string',
              example: 'MED-001',
            },
            name: {
              type: 'string',
              example: 'Paracetamol 500mg',
            },
            category: {
              type: 'string',
              example: 'Pain Relief',
            },
            totalQuantity: {
              type: 'number',
              example: 500,
            },
            unit: {
              type: 'string',
              example: 'tablets',
            },
            threshold: {
              type: 'number',
              example: 100,
              description: 'Low stock alert threshold',
            },
            lots: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  lotNumber: { type: 'string', example: 'LOT-2024-001' },
                  quantity: { type: 'number', example: 100 },
                  expiryDate: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        SuccessResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            message: {
              type: 'string',
              example: 'Operation completed successfully',
            },
            data: {
              type: 'object',
            },
          },
        },
        PaginatedResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            data: {
              type: 'array',
              items: {},
            },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'integer', example: 1 },
                limit: { type: 'integer', example: 20 },
                total: { type: 'integer', example: 100 },
                totalPages: { type: 'integer', example: 5 },
              },
            },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/routes/*.js', './src/controllers/*.js'],
};

const specs = swaggerJsdoc(options);

export default specs; 