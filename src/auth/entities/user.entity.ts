import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '../enums/role.enum';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: Role, default: Role.USER })
  role: Role;

  @Column({ nullable: true, unique: true })
  stellarWalletAddress?: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ length: 2 })
  country: string;

  @Column({ default: false })
  isVerified: boolean;

  @Column({ nullable: true, unique: true })
  emailVerificationToken?: string;

  @Column({ nullable: true })
  emailVerificationExpiry?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
