import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class Consultation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'uuid', nullable: true })
  healerId: string | null;

  @Column({ type: 'timestamp' })
  scheduledAt: Date;

  @Column({ default: false })
  cancelled: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
