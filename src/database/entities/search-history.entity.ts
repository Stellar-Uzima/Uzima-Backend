import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('search_history')
export class SearchHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  query: string;

  @Column({ type: 'jsonb', nullable: true })
  filters: Record<string, any>;

  @Column()
  userId: string;

  @CreateDateColumn()
  createdAt: Date;
}
