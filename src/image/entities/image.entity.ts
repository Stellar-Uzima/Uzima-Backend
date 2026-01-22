import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('images')
export class Image {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 500 })
  originalUrl: string;

  @Column({ type: 'varchar', length: 255 })
  filename: string;

  @Column({ type: 'varchar', length: 100 })
  mimeType: string;

  @Column({ type: 'int' })
  width: number;

  @Column({ type: 'int' })
  height: number;

  @Column({ type: 'bigint' })
  fileSize: number;

  // LQIP base64 encoded tiny image
  @Column({ type: 'text', nullable: true })
  lqip: string;

  // URLs for different formats
  @Column({ type: 'varchar', length: 500, nullable: true })
  webpUrl: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  avifUrl: string;

  // Responsive variants
  @Column({ type: 'json', nullable: true })
  variants: {
    small: { url: string; width: number; height: number };
    medium: { url: string; width: number; height: number };
    large: { url: string; width: number; height: number };
  };

  @Column({ type: 'varchar', length: 50, default: 'active' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}