// src/image/image.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { ImageService } from './image.service';
import { ImageController } from './image.controller';
import { Image } from './entities/image.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Image]),
    MulterModule.register({
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
    }),
  ],
  controllers: [ImageController],
  providers: [ImageService],
  exports: [ImageService],
})
export class ImageModule {}