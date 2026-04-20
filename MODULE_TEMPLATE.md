# NestJS Module Template Guide

This guide provides templates for creating new modules in the Stellar Uzima Backend.

## 📁 Directory Structure for a New Module

```
src/modules/your-module/
├── dto/
│   ├── create-your-item.dto.ts
│   ├── update-your-item.dto.ts
│   └── your-item.dto.ts
├── entities/
│   └── your-item.entity.ts
├── enums/
│   └── your-status.enum.ts (if needed)
├── guards/
│   └── your-item.guard.ts (if needed)
├── interceptors/
│   └── your-item.interceptor.ts (if needed)
├── interfaces/
│   └── your-item.interface.ts (if needed)
├── your-module.module.ts
├── your-module.controller.ts
├── your-module.service.ts
├── your-module.service.spec.ts
└── README.md
```

## 📝 Module Template Files

### 1. Entity Template

Create `src/modules/your-module/entities/your-item.entity.ts`:

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
  ManyToOne,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('your_items')
@Index(['userId']) // Index frequently filtered columns
export class YourItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 50, default: 'active' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;

  // Relations
  @ManyToOne(() => User, (user) => user.items)
  user: User;
}
```

### 2. Create DTO Template

Create `src/modules/your-module/dto/create-your-item.dto.ts`:

```typescript
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  Length,
} from 'class-validator';
import { YourStatus } from '../enums/your-status.enum';

export class CreateYourItemDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  name: string;

  @IsString()
  @IsOptional()
  @Length(0, 1000)
  description?: string;

  @IsEnum(YourStatus)
  @IsOptional()
  status?: YourStatus = YourStatus.ACTIVE;
}
```

### 3. Update DTO Template

Create `src/modules/your-module/dto/update-your-item.dto.ts`:

```typescript
import { PartialType } from '@nestjs/mapped-types';
import { CreateYourItemDto } from './create-your-item.dto';

export class UpdateYourItemDto extends PartialType(CreateYourItemDto) {}
```

### 4. Service Template

Create `src/modules/your-module/your-module.service.ts`:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { YourItem } from './entities/your-item.entity';
import { CreateYourItemDto } from './dto/create-your-item.dto';
import { UpdateYourItemDto } from './dto/update-your-item.dto';

@Injectable()
export class YourModuleService {
  constructor(
    @InjectRepository(YourItem)
    private repository: Repository<YourItem>,
  ) {}

  /**
   * Create a new item
   */
  async create(
    userId: string,
    createDto: CreateYourItemDto,
  ): Promise<YourItem> {
    const item = this.repository.create({
      ...createDto,
      userId,
    });
    return this.repository.save(item);
  }

  /**
   * Get all items for a user
   */
  async findAll(
    userId: string,
    skip = 0,
    take = 10,
  ): Promise<[YourItem[], number]> {
    return this.repository.findAndCount({
      where: { userId },
      skip,
      take,
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get item by ID
   */
  async findOne(id: string, userId: string): Promise<YourItem> {
    const item = await this.repository.findOne({
      where: { id, userId },
    });
    if (!item) {
      throw new NotFoundException(`Item with ID ${id} not found`);
    }
    return item;
  }

  /**
   * Update item
   */
  async update(
    id: string,
    userId: string,
    updateDto: UpdateYourItemDto,
  ): Promise<YourItem> {
    const item = await this.findOne(id, userId);
    Object.assign(item, updateDto);
    return this.repository.save(item);
  }

  /**
   * Delete item
   */
  async delete(id: string, userId: string): Promise<void> {
    const item = await this.findOne(id, userId);
    await this.repository.softRemove(item);
  }
}
```

### 5. Controller Template

Create `src/modules/your-module/your-module.controller.ts`:

```typescript
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { YourModuleService } from './your-module.service';
import { CreateYourItemDto } from './dto/create-your-item.dto';
import { UpdateYourItemDto } from './dto/update-your-item.dto';

@ApiTags('Your Module')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('your-items')
export class YourModuleController {
  constructor(private service: YourModuleService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new item' })
  async create(
    @CurrentUser('id') userId: string,
    @Body() createDto: CreateYourItemDto,
  ) {
    return this.service.create(userId, createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all items' })
  async findAll(
    @CurrentUser('id') userId: string,
    @Query('skip') skip = 0,
    @Query('take') take = 10,
  ) {
    const [items, total] = await this.service.findAll(userId, skip, take);
    return {
      data: items,
      total,
      skip,
      take,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get item by ID' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.findOne(id, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update item' })
  async update(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() updateDto: UpdateYourItemDto,
  ) {
    return this.service.update(id, userId, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete item' })
  async delete(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.service.delete(id, userId);
    return { message: 'Item deleted successfully' };
  }
}
```

### 6. Module Template

Create `src/modules/your-module/your-module.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { YourItem } from './entities/your-item.entity';
import { YourModuleService } from './your-module.service';
import { YourModuleController } from './your-module.controller';

@Module({
  imports: [TypeOrmModule.forFeature([YourItem])],
  controllers: [YourModuleController],
  providers: [YourModuleService],
  exports: [YourModuleService],
})
export class YourModule {}
```

### 7. Service Test Template

Create `src/modules/your-module/your-module.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { YourModuleService } from './your-module.service';
import { YourItem } from './entities/your-item.entity';
import { CreateYourItemDto } from './dto/create-your-item.dto';

describe('YourModuleService', () => {
  let service: YourModuleService;
  let mockRepository: any;

  const mockItem = {
    id: '1',
    userId: 'user-1',
    name: 'Test Item',
    description: 'Test description',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockRepository = {
      create: jest.fn().mockReturnValue(mockItem),
      save: jest.fn().mockResolvedValue(mockItem),
      find: jest.fn().mockResolvedValue([mockItem]),
      findOne: jest.fn().mockResolvedValue(mockItem),
      findAndCount: jest.fn().mockResolvedValue([[mockItem], 1]),
      softRemove: jest.fn().mockResolvedValue(mockItem),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YourModuleService,
        {
          provide: getRepositoryToken(YourItem),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<YourModuleService>(YourModuleService);
  });

  describe('create', () => {
    it('should create an item', async () => {
      const createDto: CreateYourItemDto = {
        name: 'Test Item',
        description: 'Test description',
      };

      const result = await service.create('user-1', createDto);

      expect(mockRepository.create).toHaveBeenCalledWith({
        ...createDto,
        userId: 'user-1',
      });
      expect(mockRepository.save).toHaveBeenCalledWith(mockItem);
      expect(result).toEqual(mockItem);
    });
  });

  describe('findOne', () => {
    it('should return an item', async () => {
      const result = await service.findOne('1', 'user-1');

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: '1', userId: 'user-1' },
      });
      expect(result).toEqual(mockItem);
    });

    it('should throw NotFoundException if item not found', async () => {
      mockRepository.findOne.mockResolvedValueOnce(null);

      await expect(
        service.findOne('nonexistent', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return items with pagination', async () => {
      const [items, total] = await service.findAll('user-1', 0, 10);

      expect(mockRepository.findAndCount).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        skip: 0,
        take: 10,
        order: { createdAt: 'DESC' },
      });
      expect(items).toEqual([mockItem]);
      expect(total).toEqual(1);
    });
  });
});
```

### 8. Module README Template

Create `src/modules/your-module/README.md`:

```markdown
# Your Module

Brief description of what this module does.

## Overview

Detailed overview of the module functionality.

## Features

- Feature 1
- Feature 2
- Feature 3

## API Endpoints

### Get All Items
\`\`\`http
GET /api/your-items
\`\`\`

### Create Item
\`\`\`http
POST /api/your-items
Content-Type: application/json

{
  "name": "Item name",
  "description": "Optional description"
}
\`\`\`

### Get Item by ID
\`\`\`http
GET /api/your-items/:id
\`\`\`

### Update Item
\`\`\`http
PATCH /api/your-items/:id
Content-Type: application/json

{
  "name": "Updated name"
}
\`\`\`

### Delete Item
\`\`\`http
DELETE /api/your-items/:id
\`\`\`

## Service Methods

### YourModuleService

- \`create(userId, dto)\` - Create new item
- \`findAll(userId, skip, take)\` - Get all items with pagination
- \`findOne(id, userId)\` - Get item by ID
- \`update(id, userId, dto)\` - Update item
- \`delete(id, userId)\` - Delete item

## Data Structures

### YourItem Entity

\`\`\`typescript
@Entity('your_items')
export class YourItem {
  id: string;
  userId: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}
\`\`\`

### DTOs

**CreateYourItemDto**
- name (required, string)
- description (optional, string)

**UpdateYourItemDto**
- All fields optional

## Usage Examples

[Include usage examples here]

## Testing

[Include testing information here]

## Performance Considerations

[Include performance notes here]
```

## 🔄 Steps to Create a New Module

1. **Create Directory Structure**
   ```bash
   mkdir -p src/modules/your-module/{dto,entities,enums,guards,interceptors,interfaces}
   ```

2. **Create Entity**
   - Use the entity template
   - Define all columns and relationships
   - Add indexes for frequently filtered columns

3. **Create DTOs**
   - CreateYourItemDto
   - UpdateYourItemDto (use PartialType)
   - Optionally: YourItemResponseDto

4. **Create Service**
   - Inject repository using @InjectRepository
   - Implement CRUD operations
   - Add custom business logic

5. **Create Controller**
   - Add route decorators (@Get, @Post, etc.)
   - Use guards (@UseGuards)
   - Add Swagger documentation

6. **Create Module**
   - Import TypeOrmModule.forFeature([Entity])
   - Register controller and service
   - Export service for other modules

7. **Add to AppModule**
   ```typescript
   // src/app.module.ts
   import { YourModule } from './modules/your-module/your-module.module';

   @Module({
     imports: [YourModule],
   })
   export class AppModule {}
   ```

8. **Create Tests**
   - Unit tests for service
   - Unit tests for controller
   - E2E tests

9. **Create README**
   - Document all endpoints
   - Include usage examples
   - Add performance notes

## 🎯 Checklist

- [ ] Directory structure created
- [ ] Entity created with validation
- [ ] DTOs created and validated
- [ ] Service implemented with CRUD operations
- [ ] Controller implemented with routes
- [ ] Module created and exported
- [ ] Module added to AppModule
- [ ] Tests written (service + controller)
- [ ] README created with documentation
- [ ] Code formatted with Prettier
- [ ] No linting errors
- [ ] All tests pass

## 📚 References

- [NestJS Modules Documentation](https://docs.nestjs.com/modules)
- [NestJS Controllers Documentation](https://docs.nestjs.com/controllers)
- [NestJS Providers Documentation](https://docs.nestjs.com/providers)
- [TypeORM Documentation](https://typeorm.io/)

## 🆘 Need Help?

Refer to existing modules:
- `src/modules/auth/` - Authentication module example
- `src/modules/users/` - User management module example
- `src/modules/health-tasks/` - Health tasks module example
