import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('healer_availability')
@Index(['healerId', 'startTime'])
export class HealerAvailability {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  healerId: string;

  @Column({ type: 'timestamp' })
  startTime: Date;

  @Column({ type: 'timestamp' })
  endTime: Date;

  @CreateDateColumn()
  createdAt: Date;
}
