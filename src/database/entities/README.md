# Database Entities

This directory contains all TypeORM entities for the Stellar Uzima backend.

## Overview

Entities represent database tables and define the schema structure. Each entity:
- Maps to a database table
- Defines column types and constraints
- May include relationships to other entities
- Should have proper documentation

## Creating an Entity

### Basic Entity Structure

```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  firstName?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  lastName?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

## Entity Relationships

### One-to-Many Relationship

```typescript
// User.entity.ts
@Entity('users')
export class User {
  @OneToMany(() => Task, (task) => task.user, { eager: true })
  tasks: Task[];
}

// Task.entity.ts
@Entity('tasks')
export class Task {
  @ManyToOne(() => User, (user) => user.tasks)
  user: User;

  @Column()
  userId: string;
}
```

### Many-to-Many Relationship

```typescript
@Entity('users')
export class User {
  @ManyToMany(() => Role, (role) => role.users)
  @JoinTable({ name: 'user_roles' })
  roles: Role[];
}

@Entity('roles')
export class Role {
  @ManyToMany(() => User, (user) => user.roles)
  users: User[];
}
```

## Column Types

### Common Column Types

```typescript
// String
@Column({ type: 'varchar', length: 255 })
name: string;

// Number
@Column({ type: 'int' })
age: number;

@Column({ type: 'decimal', precision: 10, scale: 2 })
price: number;

// Boolean
@Column({ type: 'boolean', default: false })
isActive: boolean;

// Date
@Column({ type: 'timestamp' })
date: Date;

@CreateDateColumn()
createdAt: Date;

@UpdateDateColumn()
updatedAt: Date;

// JSON
@Column({ type: 'jsonb', nullable: true })
metadata: any;

// Enum
@Column({ type: 'enum', enum: UserRole })
role: UserRole;
```

## Column Decorators

```typescript
@Column({
  type: 'varchar',
  length: 255,
  nullable: false,        // NOT NULL constraint
  unique: true,           // UNIQUE constraint
  default: 'value',       // Default value
  name: 'custom_name',    // Custom column name
  comment: 'Description', // Column comment
  select: false,          // Exclude from SELECT queries
})
```

## Index Decorators

```typescript
// Single column index
@Index()
@Column()
email: string;

// Unique index
@Index({ unique: true })
@Column()
username: string;

// Custom index name
@Index('idx_user_email')
@Column()
email: string;

// Composite index on multiple columns
@Index(['email', 'isActive'])
```

## Best Practices

1. **Use UUID for Primary Keys**
   - More secure than auto-increment integers
   - Better for distributed systems
   ```typescript
   @PrimaryGeneratedColumn('uuid')
   id: string;
   ```

2. **Add Timestamps**
   - Track creation and modification dates
   ```typescript
   @CreateDateColumn()
   createdAt: Date;

   @UpdateDateColumn()
   updatedAt: Date;
   ```

3. **Add Soft Delete**
   - Keep historical data while marking as deleted
   ```typescript
   @DeleteDateColumn()
   deletedAt?: Date;
   ```

4. **Index Frequently Queried Columns**
   - Improves query performance
   ```typescript
   @Index()
   @Column()
   email: string;
   ```

5. **Use Nullable Wisely**
   - Mark truly optional fields as nullable
   ```typescript
   @Column({ nullable: true })
   middleName?: string;
   ```

6. **Add Comments**
   - Document complex fields
   ```typescript
   @Column({ 
     comment: 'User email address for login and notifications'
   })
   email: string;
   ```

## Naming Conventions

- **Entity name**: PascalCase, singular (User, Task, Role)
- **Table name**: snake_case, plural (users, tasks, roles)
- **Column name**: snake_case (first_name, last_name)
- **Foreign key**: snake_case with _id suffix (user_id, role_id)

## Example Complete Entity

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
  OneToMany,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { Task } from './task.entity';
import { Role } from './role.entity';

@Entity('users')
@Index(['email'])
@Index(['username'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  username: string;

  @Column({ type: 'varchar', length: 255, select: false })
  password: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  firstName?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  lastName?: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastLogin?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;

  // Relations
  @OneToMany(() => Task, (task) => task.user, { cascade: true })
  tasks: Task[];

  @ManyToMany(() => Role, (role) => role.users)
  @JoinTable({ name: 'user_roles' })
  roles: Role[];
}
```

## Migration Guide

See [Database Module README](../README.md) for migration creation and management.

## References

- [TypeORM Entity Documentation](https://typeorm.io/entities)
- [Column Types](https://typeorm.io/entities#column-types)
- [Relations](https://typeorm.io/relations)
