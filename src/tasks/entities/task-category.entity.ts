import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export interface NameTranslations {
  en: string;
  fr?: string;
  sw?: string;
  ha?: string;
  yo?: string;
  ig?: string;
  am?: string;
  ar?: string;
  pt?: string;
  zu?: string;
  xh?: string;
  so?: string;
}

@Entity('task_categories')
export class TaskCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ type: 'json' })
  nameTranslations: NameTranslations;

  @Column({ nullable: true })
  icon: string;

  @Column({ nullable: true })
  color: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
