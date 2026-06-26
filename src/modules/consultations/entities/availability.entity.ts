import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('healer_availability')
@Index(['healerId', 'startTime'])
export class HealerAvailability {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  healerId: string;

  @Column({ type: 'datetime' })
  startTime: Date;

  @Column({ type: 'datetime' })
  endTime: Date;

  @CreateDateColumn()
  createdAt: Date;
}
