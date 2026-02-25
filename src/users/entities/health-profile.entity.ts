import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, BeforeInsert, BeforeUpdate } from 'typeorm';
import * as crypto from 'crypto';
import { User } from './user.entity';

const AES_KEY = process.env.AES_KEY || '32charslongsecretkeymustbesecure!'; // 32 chars for AES-256
const IV_LENGTH = 16;

function encrypt(text: string): string {
  if (!text) return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(AES_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

@Entity('health_profiles')
export class HealthProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User)
  @JoinColumn()
  user: User;

  @Column('text', { array: true })
  healthGoals: string[];

  @Column({ nullable: true })
  chronicConditions: string; // AES encrypted

  @Column({ default: 'BOTH' })
  preferredHealerType: string;

  @Column({ default: 3 })
  dailyTaskTarget: number;

  @BeforeInsert()
  @BeforeUpdate()
  encryptChronicConditions() {
    if (this.chronicConditions) {
      this.chronicConditions = encrypt(this.chronicConditions);
    }
  }
}