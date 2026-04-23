import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { TaskCategory } from '../../../tasks/entities/health-task.entity';

export interface TaskTemplateFields {
  title: string;
  description?: string;
  category: TaskCategory;
  xlmReward?: number;
  targetProfile?: Record<string, any>;
}

export interface TaskTemplate {
  id: string;
  name: string;
  ownerId: string;
  sharedWith: string[];
  fields: TaskTemplateFields;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTemplateDto {
  name: string;
  fields: TaskTemplateFields;
}

export interface UpdateTemplateDto {
  name?: string;
  fields?: Partial<TaskTemplateFields>;
}

@Injectable()
export class TaskTemplatesService {
  private readonly templates = new Map<string, TaskTemplate>();
  private counter = 0;

  create(ownerId: string, dto: CreateTemplateDto): TaskTemplate {
    const key = `${ownerId}:${dto.name}`;
    if (this.templates.has(key)) {
      throw new ConflictException(`Template "${dto.name}" already exists`);
    }

    const template: TaskTemplate = {
      id: `tmpl_${++this.counter}`,
      name: dto.name,
      ownerId,
      sharedWith: [],
      fields: dto.fields,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.templates.set(template.id, template);
    return template;
  }

  findById(id: string): TaskTemplate {
    const template = this.templates.get(id);
    if (!template) throw new NotFoundException(`Template ${id} not found`);
    return template;
  }

  listOwned(ownerId: string): TaskTemplate[] {
    return Array.from(this.templates.values()).filter((t) => t.ownerId === ownerId);
  }

  listAccessible(userId: string): TaskTemplate[] {
    return Array.from(this.templates.values()).filter(
      (t) => t.ownerId === userId || t.sharedWith.includes(userId),
    );
  }

  update(id: string, requesterId: string, dto: UpdateTemplateDto): TaskTemplate {
    const template = this.findById(id);
    this.requireOwner(template, requesterId);

    if (dto.name) template.name = dto.name;
    if (dto.fields) template.fields = { ...template.fields, ...dto.fields };
    template.updatedAt = new Date();

    return template;
  }

  delete(id: string, requesterId: string): void {
    const template = this.findById(id);
    this.requireOwner(template, requesterId);
    this.templates.delete(id);
  }

  share(id: string, ownerId: string, targetUserId: string): TaskTemplate {
    const template = this.findById(id);
    this.requireOwner(template, ownerId);

    if (!template.sharedWith.includes(targetUserId)) {
      template.sharedWith.push(targetUserId);
      template.updatedAt = new Date();
    }

    return template;
  }

  unshare(id: string, ownerId: string, targetUserId: string): TaskTemplate {
    const template = this.findById(id);
    this.requireOwner(template, ownerId);

    template.sharedWith = template.sharedWith.filter((u) => u !== targetUserId);
    template.updatedAt = new Date();

    return template;
  }

  instantiate(id: string, requesterId: string, overrides?: Partial<TaskTemplateFields>): TaskTemplateFields {
    const template = this.findById(id);
    const hasAccess =
      template.ownerId === requesterId || template.sharedWith.includes(requesterId);

    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this template');
    }

    return { ...template.fields, ...overrides };
  }

  private requireOwner(template: TaskTemplate, requesterId: string): void {
    if (template.ownerId !== requesterId) {
      throw new ForbiddenException('Only the template owner can perform this action');
    }
  }
}
