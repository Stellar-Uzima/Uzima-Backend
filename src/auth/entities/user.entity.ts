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

  @Column({ type: 'simple-enum', enum: Role, default: Role.USER })
  role: Role;

  @Column({ nullable: true, unique: true })
  stellarWalletAddress?: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ length: 2 })
  country: string;

  @Column({ nullable: true, length: '255' })
  address?: string;

  @Column({ nullable: true, length: '100' })
  city?: string;

  @Column({ nullable: true, length: '20' })
  postalCode?: string;

  @Column({ default: false })
  isVerified: boolean;

  @Column({ nullable: true, unique: true })
  emailVerificationToken?: string;

  @Column({ nullable: true })
  emailVerificationExpiry?: Date;

  @Column({ nullable: true })
  passwordResetToken?: string;

  @Column({ type: 'datetime', nullable: true })
  passwordResetExpiry?: Date;

  @Column({ nullable: true, unique: true })
  phoneNumber?: string;

  @Column({ type: 'datetime', nullable: true })
  lastActiveAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
