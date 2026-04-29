# Health Tasks Module

The Health Tasks module manages user health-related tasks, goals, and tracking. This module provides endpoints for creating, updating, retrieving, and managing health tasks.

## Overview

Health tasks are actionable health goals that users can create and track. Examples include:
- Daily exercise routines
- Medication reminders
- Nutrition goals
- Sleep tracking
- Water intake tracking
- Mental health practices

## Features

- ✅ Create health tasks
- ✅ Update task status and progress
- ✅ Mark tasks as complete
- ✅ Track task history
- ✅ Filter and search tasks
- ✅ Set reminders
- ✅ Progress analytics

## API Endpoints

### Get All Tasks
```http
GET /api/health-tasks
```

Query Parameters:
- `status`: Task status (pending, in-progress, completed)
- `category`: Task category (exercise, nutrition, medication, etc.)
- `skip`: Number of records to skip (default: 0)
- `take`: Number of records to return (default: 10)

Example:
```bash
curl http://localhost:3000/api/health-tasks?status=pending&category=exercise
```

### Get Task by ID
```http
GET /api/health-tasks/:id
```

### Create New Task
```http
POST /api/health-tasks
Content-Type: application/json

{
  "title": "Morning Exercise",
  "description": "30 minutes of cardio",
  "category": "exercise",
  "priority": "high",
  "dueDate": "2024-12-31T09:00:00Z",
  "reminder": true,
  "reminderTime": "08:45:00"
}
```

### Update Task
```http
PATCH /api/health-tasks/:id
Content-Type: application/json

{
  "title": "Updated title",
  "status": "in-progress"
}
```

### Mark Task as Complete
```http
PATCH /api/health-tasks/:id/complete
```

### Delete Task
```http
DELETE /api/health-tasks/:id
```

## Data Structures

### HealthTask Entity

```typescript
@Entity('health_tasks')
export class HealthTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'varchar' })
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({
    type: 'enum',
    enum: TaskCategory,
    default: TaskCategory.GENERAL,
  })
  category: TaskCategory;

  @Column({
    type: 'enum',
    enum: TaskStatus,
    default: TaskStatus.PENDING,
  })
  status: TaskStatus;

  @Column({
    type: 'enum',
    enum: TaskPriority,
    default: TaskPriority.MEDIUM,
  })
  priority: TaskPriority;

  @Column({ type: 'timestamp', nullable: true })
  dueDate?: Date;

  @Column({ type: 'boolean', default: false })
  reminder: boolean;

  @Column({ type: 'time', nullable: true })
  reminderTime?: string;

  @Column({ type: 'int', default: 0 })
  progress: number;

  @Column({ type: 'timestamp', nullable: true })
  completedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, (user) => user.tasks)
  user: User;
}
```

### Enums

```typescript
export enum TaskCategory {
  EXERCISE = 'exercise',
  NUTRITION = 'nutrition',
  MEDICATION = 'medication',
  SLEEP = 'sleep',
  MENTAL_HEALTH = 'mental_health',
  GENERAL = 'general',
}

export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}
```

### DTOs

#### CreateHealthTaskDto
```typescript
export class CreateHealthTaskDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(TaskCategory)
  @IsOptional()
  category?: TaskCategory = TaskCategory.GENERAL;

  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority = TaskPriority.MEDIUM;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsBoolean()
  @IsOptional()
  reminder?: boolean = false;

  @IsString()
  @IsOptional()
  reminderTime?: string;
}
```

#### UpdateHealthTaskDto
```typescript
export class UpdateHealthTaskDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;

  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(100)
  progress?: number;
}
```

## Service Methods

### HealthTasksService

```typescript
@Injectable()
export class HealthTasksService {
  // Find all tasks for authenticated user
  findAll(
    userId: string,
    filters?: {
      status?: TaskStatus;
      category?: TaskCategory;
      skip?: number;
      take?: number;
    },
  ): Promise<[HealthTask[], number]>;

  // Find task by ID
  findOne(id: string, userId: string): Promise<HealthTask>;

  // Create new task
  create(
    userId: string,
    createHealthTaskDto: CreateHealthTaskDto,
  ): Promise<HealthTask>;

  // Update task
  update(
    id: string,
    userId: string,
    updateHealthTaskDto: UpdateHealthTaskDto,
  ): Promise<HealthTask>;

  // Mark task as complete
  markComplete(id: string, userId: string): Promise<HealthTask>;

  // Delete task
  delete(id: string, userId: string): Promise<void>;

  // Get task statistics
  getStatistics(userId: string): Promise<TaskStatistics>;

  // Get tasks due today
  getTasksDueToday(userId: string): Promise<HealthTask[]>;
}
```

## Usage Examples

### Create a Task
```typescript
const task = await healthTasksService.create(userId, {
  title: 'Morning Run',
  description: '5km run at 6 AM',
  category: TaskCategory.EXERCISE,
  priority: TaskPriority.HIGH,
  dueDate: new Date('2024-12-25T06:00:00Z'),
  reminder: true,
  reminderTime: '05:45:00',
});
```

### Get Tasks by Status
```typescript
const [pendingTasks, count] = await healthTasksService.findAll(
  userId,
  {
    status: TaskStatus.PENDING,
    skip: 0,
    take: 10,
  },
);
```

### Update Task Progress
```typescript
await healthTasksService.update(taskId, userId, {
  progress: 50,
  status: TaskStatus.IN_PROGRESS,
});
```

## Best Practices

1. **Always Validate Input**
   - Use DTOs with validation decorators
   - Check user ownership before operations

2. **Implement Pagination**
   - Default to 10 items per page
   - Support offset and limit parameters

3. **Add Timestamps**
   - Track createdAt and updatedAt
   - Track completedAt for completed tasks

4. **Handle Time Zones**
   - Store all times in UTC
   - Convert to user timezone on response

5. **Optimize Queries**
   - Use indexes on frequently filtered columns
   - Eager load related data when needed
   - Use `select: false` for sensitive data

6. **Add Business Logic**
   - Validate task deadlines
   - Implement reminder notifications
   - Track task completion metrics

## Testing

```typescript
describe('HealthTasksService', () => {
  let service: HealthTasksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HealthTasksService, ...mockProviders],
    }).compile();

    service = module.get<HealthTasksService>(HealthTasksService);
  });

  it('should create a health task', async () => {
    const result = await service.create(userId, createDto);
    expect(result).toHaveProperty('id');
    expect(result.title).toBe(createDto.title);
  });

  it('should get all tasks for user', async () => {
    const [tasks, count] = await service.findAll(userId);
    expect(Array.isArray(tasks)).toBe(true);
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
```

## Performance Considerations

1. **Database Indexes**
   - Index on `userId` for fast filtering
   - Index on `status` for quick status queries
   - Composite index on `userId` and `dueDate`

2. **Query Optimization**
   - Use pagination to limit result sets
   - Only select necessary columns
   - Avoid N+1 queries

3. **Caching**
   - Cache user statistics
   - Cache frequently accessed tasks
   - Invalidate cache on updates

## Future Enhancements

- [ ] Task recurring patterns (daily, weekly, monthly)
- [ ] Task dependencies
- [ ] Collaborative tasks
- [ ] Task history and audit logs
- [ ] Advanced filtering and search
- [ ] Task templates
- [ ] Integration with calendar apps
- [ ] SMS/Email reminders

## References

- [Module Documentation](https://docs.nestjs.com/modules)
- [Database Entities](../database/entities/README.md)
- [Common DTOs](../common/dtos/README.md)
