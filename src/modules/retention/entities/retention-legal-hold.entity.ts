import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('retention_legal_holds')
@Index('IDX_retention_legal_holds_active_record', ['dataClass', 'recordId'])
export class RetentionLegalHold {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'data_class', type: 'varchar', length: 100 })
  dataClass: string;

  @Column({ name: 'record_id', type: 'varchar', length: 255 })
  recordId: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({
    name: 'created_by',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  createdBy: string | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp with time zone',
  })
  createdAt: Date;

  @Column({
    name: 'released_at',
    type: 'timestamp with time zone',
    nullable: true,
  })
  releasedAt: Date | null;
}
