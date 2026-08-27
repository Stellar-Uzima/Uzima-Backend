import 'reflect-metadata';
import { validate } from 'class-validator';
import { getMetadataArgsStorage } from 'typeorm';
import { TaskExportRequest, TaskExportRequestStatus } from './task-export-request.entity';

describe('TaskExportRequest entity', () => {
  const validUserId = '3d6f0a4e-d3ea-4bc1-ae7b-7db9f79ba12a';

  it('maps to the task_export_requests table with required columns', () => {
    const table = getMetadataArgsStorage().tables.find(
      (metadata) => metadata.target === TaskExportRequest
    );
    const columns = getMetadataArgsStorage().columns.filter(
      (metadata) => metadata.target === TaskExportRequest
    );

    expect(table?.name).toBe('task_export_requests');
    expect(columns.map((column) => column.propertyName)).toEqual(
      expect.arrayContaining([
        'id',
        'userId',
        'status',
        'requestedAt',
        'completedAt',
        'downloadExpiresAt',
        'createdAt',
        'updatedAt',
      ])
    );

    expect(columns.find((column) => column.propertyName === 'userId')?.options).toMatchObject({
      type: 'uuid',
    });
    expect(columns.find((column) => column.propertyName === 'requestedAt')?.options).toMatchObject({
      type: 'timestamp',
    });
    expect(columns.find((column) => column.propertyName === 'completedAt')?.options).toMatchObject({
      type: 'timestamp',
      nullable: true,
    });
    expect(
      columns.find((column) => column.propertyName === 'downloadExpiresAt')?.options
    ).toMatchObject({
      type: 'timestamp',
      nullable: true,
    });
  });

  it('defines only the supported export request statuses', () => {
    expect(Object.values(TaskExportRequestStatus)).toEqual([
      'pending',
      'processing',
      'completed',
      'failed',
      'expired',
    ]);
  });

  it('accepts a valid request record', async () => {
    const request = new TaskExportRequest();
    request.userId = validUserId;
    request.status = TaskExportRequestStatus.PENDING;
    request.requestedAt = new Date();

    await expect(validate(request)).resolves.toHaveLength(0);
  });

  it('requires a valid user id, status, and requested date', async () => {
    const request = new TaskExportRequest();
    request.userId = 'not-a-uuid';
    request.status = 'queued' as TaskExportRequestStatus;
    request.requestedAt = '2026-06-28' as unknown as Date;

    const errors = await validate(request);
    const constraintsByProperty = Object.fromEntries(
      errors.map((error) => [error.property, Object.keys(error.constraints ?? {})])
    );

    expect(constraintsByProperty.userId).toContain('isUuid');
    expect(constraintsByProperty.status).toContain('isEnum');
    expect(constraintsByProperty.requestedAt).toContain('isDate');
  });
});
