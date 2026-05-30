import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToMany,
} from 'typeorm';
import { IsString, IsOptional, IsUrl, Length } from 'class-validator';
import { User } from './user.entity';

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 255 })
  @IsString()
  @Length(1, 255)
  name: string;

  @Column({ nullable: true, length: 1000 })
  @IsOptional()
  @IsString()
  @Length(1, 1000)
  description?: string;

  @Column({ nullable: true, length: 500 })
  @IsOptional()
  @IsUrl({}, { message: 'Website must be a valid URL' })
  website?: string;

  @ManyToMany(() => User, (user) => user.organizations)
  users: User[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
