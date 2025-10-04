// src/image/image.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Image } from './entities/image.entity';
import * as sharp from 'sharp';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

@Injectable()
export class ImageService {
  private readonly uploadPath = join(process.cwd(), 'uploads', 'images');

  constructor(
    @InjectRepository(Image)
    private imageRepository: Repository<Image>,
  ) {
    // Ensure upload directory exists
    if (!existsSync(this.uploadPath)) {
      mkdirSync(this.uploadPath, { recursive: true });
    }
  }

  async processAndUpload(file: Express.Multer.File): Promise<Image> {
    const filename = `${Date.now()}-${file.originalname}`;
    const imagePath = join(this.uploadPath, filename);

    // Get image metadata
    const metadata = await sharp(file.buffer).metadata();

    // Generate LQIP (Low Quality Image Placeholder) - 20px wide
    const lqipBuffer = await sharp(file.buffer)
      .resize(20, null, { fit: 'inside' })
      .blur(5)
      .jpeg({ quality: 30 })
      .toBuffer();
    const lqip = `data:image/jpeg;base64,${lqipBuffer.toString('base64')}`;

    // Save original
    await sharp(file.buffer).toFile(imagePath);

    // Generate WebP variant
    const webpFilename = filename.replace(/\.[^.]+$/, '.webp');
    const webpPath = join(this.uploadPath, webpFilename);
    await sharp(file.buffer)
      .webp({ quality: 85, effort: 6 })
      .toFile(webpPath);

    // Generate AVIF variant
    const avifFilename = filename.replace(/\.[^.]+$/, '.avif');
    const avifPath = join(this.uploadPath, avifFilename);
    await sharp(file.buffer)
      .avif({ quality: 80, effort: 6 })
      .toFile(avifPath);

    // Generate responsive variants
    const variants = await this.generateVariants(file.buffer, filename);

    const image = this.imageRepository.create({
      originalUrl: `/uploads/images/${filename}`,
      filename,
      mimeType: file.mimetype,
      width: metadata.width,
      height: metadata.height,
      fileSize: file.size,
      lqip,
      webpUrl: `/uploads/images/${webpFilename}`,
      avifUrl: `/uploads/images/${avifFilename}`,
      variants,
    });

    return await this.imageRepository.save(image);
  }

  private async generateVariants(buffer: Buffer, filename: string) {
    const baseFilename = filename.replace(/\.[^.]+$/, '');
    const ext = filename.split('.').pop();

    // Small - 640px
    const smallFilename = `${baseFilename}-small.${ext}`;
    const smallPath = join(this.uploadPath, smallFilename);
    const smallMeta = await sharp(buffer)
      .resize(640, null, { fit: 'inside', withoutEnlargement: true })
      .toFile(smallPath);

    // Medium - 1024px
    const mediumFilename = `${baseFilename}-medium.${ext}`;
    const mediumPath = join(this.uploadPath, mediumFilename);
    const mediumMeta = await sharp(buffer)
      .resize(1024, null, { fit: 'inside', withoutEnlargement: true })
      .toFile(mediumPath);

    // Large - 1920px
    const largeFilename = `${baseFilename}-large.${ext}`;
    const largePath = join(this.uploadPath, largeFilename);
    const largeMeta = await sharp(buffer)
      .resize(1920, null, { fit: 'inside', withoutEnlargement: true })
      .toFile(largePath);

    return {
      small: {
        url: `/uploads/images/${smallFilename}`,
        width: smallMeta.width,
        height: smallMeta.height,
      },
      medium: {
        url: `/uploads/images/${mediumFilename}`,
        width: mediumMeta.width,
        height: mediumMeta.height,
      },
      large: {
        url: `/uploads/images/${largeFilename}`,
        width: largeMeta.width,
        height: largeMeta.height,
      },
    };
  }

  async findAll(): Promise<Image[]> {
    return await this.imageRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Image> {
    const image = await this.imageRepository.findOne({ where: { id } });
    if (!image) {
      throw new NotFoundException(`Image with ID ${id} not found`);
    }
    return image;
  }

  async remove(id: string): Promise<void> {
    const image = await this.findOne(id);
    await this.imageRepository.remove(image);
  }

  // Get optimized image based on connection quality
  async getOptimizedImage(id: string, quality: string = 'auto') {
    const image = await this.findOne(id);
    
    const qualityMap = {
      low: image.variants.small,
      medium: image.variants.medium,
      high: image.variants.large,
      auto: image.variants.medium, // Default to medium
    };

    return {
      ...image,
      recommendedUrl: qualityMap[quality] || qualityMap.auto,
    };
  }
}