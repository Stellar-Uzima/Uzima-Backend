import { Test, TestingModule } from '@nestjs/testing';
import { TaskTemplatesService } from './templates.service';
import { ConflictException, NotFoundException, ForbiddenException } from '@nestjs/common';

describe('TaskTemplatesService', () => {
  let service: TaskTemplatesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TaskTemplatesService],
    }).compile();
    service = module.get<TaskTemplatesService>(TaskTemplatesService);
  });

  it('should be defined', () => { expect(service).toBeDefined(); });

  it('create returns a new template with generated id and owner', () => {
    const t = service.create('user1', { name: 'Morning', fields: { title: 'Walk', category: 'fitness' as any } });
    expect(t).toHaveProperty('id');
    expect(t.name).toBe('Morning');
    expect(t.ownerId).toBe('user1');
  });

  it('create throws ConflictException for duplicate name within same owner', () => {
    service.create('user1', { name: 'Dupe', fields: { title: 'Walk', category: 'fitness' as any } });
    expect(() =>
      service.create('user1', { name: 'Dupe', fields: { title: 'Run', category: 'fitness' as any } }),
    ).toThrow(ConflictException);
  });

  it('create allows same template name for different owners', () => {
    service.create('user1', { name: 'Plan', fields: { title: 'A', category: 'fitness' as any } });
    expect(() =>
      service.create('user2', { name: 'Plan', fields: { title: 'B', category: 'fitness' as any } }),
    ).not.toThrow();
  });

  it('create throws ForbiddenException when accessing another owner template', () => {
    const t = service.create('user1', { name: 'Private', fields: { title: 'X', category: 'fitness' as any } });
    expect(() => service.get(t.id, 'user2')).toThrow(ForbiddenException);
  });
});
