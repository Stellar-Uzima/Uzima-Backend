import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiResponse,
  ApiResponseOptions,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
  ApiInternalServerErrorResponse,
  ApiResponseMetadata,
} from '@nestjs/swagger';

/**
 * Standard API response decorator that combines common response types
 *
 * Usage:
 * @ApiStandardResponse({ type: UserResponseDto, description: 'User retrieved successfully' })
 */
export function ApiStandardResponse<TModel extends Type<any>>(
  options: ApiResponseMetadata & { type?: TModel } = {},
) {
  const {
    type,
    description = 'Success',
    status = 200,
    ...restOptions
  } = options;

  const decorators: Array<ClassDecorator | MethodDecorator> = [
    ApiResponse({
      status,
      description,
      type,
      ...restOptions,
    } as ApiResponseOptions),
    ApiBadRequestResponse({
      description: 'Bad Request - Invalid input data',
      schema: {
        example: {
          statusCode: 400,
          message: ['validation error details'],
          error: 'Bad Request',
        },
      },
    }),
    ApiUnauthorizedResponse({
      description: 'Unauthorized - JWT token missing or invalid',
      schema: {
        example: {
          statusCode: 401,
          message: 'Unauthorized',
        },
      },
    }),
    ApiNotFoundResponse({
      description: 'Resource not found',
      schema: {
        example: {
          statusCode: 404,
          message: 'Resource not found',
        },
      },
    }),
    ApiInternalServerErrorResponse({
      description: 'Internal server error',
      schema: {
        example: {
          statusCode: 500,
          message: 'Internal server error',
        },
      },
    }),
  ];

  return applyDecorators(...decorators);
}

/**
 * Standard API response for paginated results
 *
 * Usage:
 * @ApiPaginatedResponse(UserResponseDto, { description: 'Users retrieved successfully' })
 */
export function ApiPaginatedResponse<TModel extends Type<any>>(
  model: TModel,
  options: Omit<ApiResponseMetadata, 'type'> = {},
) {
  const { description = 'Success', status = 200, ...restOptions } = options;

  return applyDecorators(
    ApiResponse({
      status,
      description,
      schema: {
        properties: {
          data: {
            type: 'array',
            items: { $ref: `#/components/schemas/${model.name}` },
          },
          meta: {
            type: 'object',
            properties: {
              total: { type: 'number', example: 100 },
              page: { type: 'number', example: 1 },
              limit: { type: 'number', example: 10 },
              totalPages: { type: 'number', example: 10 },
            },
          },
        },
      },
      ...restOptions,
    }),
    ApiBadRequestResponse({
      description: 'Bad Request - Invalid input data',
    }),
    ApiUnauthorizedResponse({
      description: 'Unauthorized - JWT token missing or invalid',
    }),
    ApiInternalServerErrorResponse({
      description: 'Internal server error',
    }),
  );
}

/**
 * API response for create operations (returns 201)
 *
 * Usage:
 * @ApiCreatedResponse(UserResponseDto, { description: 'User created successfully' })
 */
export function ApiCreatedResponse<TModel extends Type<any>>(
  model: TModel,
  options: Omit<ApiResponseMetadata, 'type'> = {},
) {
  const { description = 'Resource created successfully', ...restOptions } =
    options;

  return ApiStandardResponse({
    type: model,
    status: 201,
    description,
    ...restOptions,
  });
}

/**
 * API response for delete operations (returns 204)
 *
 * Usage:
 * @ApiNoContentResponse({ description: 'Resource deleted successfully' })
 */
export function ApiNoContentResponse(
  options: Omit<ApiResponseMetadata, 'type' | 'status'> = {},
) {
  const { description = 'Resource deleted successfully', ...restOptions } =
    options;

  return applyDecorators(
    ApiResponse({
      status: 204,
      description,
      ...restOptions,
    }),
    ApiUnauthorizedResponse({
      description: 'Unauthorized - JWT token missing or invalid',
    }),
    ApiNotFoundResponse({
      description: 'Resource not found',
    }),
  );
}
