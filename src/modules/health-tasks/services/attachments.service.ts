import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskAttachment } from '../../../database/entities/task-attachment.entity';

@Injectable()
export class AttachmentsService {
  constructor(
    @InjectRepository(TaskAttachment)
    private readonly attachmentRepository: Repository<TaskAttachment>,
  ) {}

  async createAttachment(taskId: string, fileData: {
    fileName: string;
    fileUrl: string;
    fileType: string;
    fileSize: number;
    uploadedBy?: string;
  }): Promise<TaskAttachment> {
    const attachment = this.attachmentRepository.create({
      taskId,
      ...fileData,
    });
    return this.attachmentRepository.save(attachment);
  }

  async getAttachmentsByTask(taskId: string): Promise<TaskAttachment[]> {
    return this.attachmentRepository.find({
      where: { taskId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<TaskAttachment> {
    const attachment = await this.attachmentRepository.findOne({ where: { id } });
    if (!attachment) {
      throw new NotFoundException(`Attachment with ID ${id} not found`);
    }
    return attachment;
  }

  async deleteAttachment(id: string): Promise<void> {
    const attachment = await this.findOne(id);
    // In a real scenario, you would also delete the file from storage (S3, local, etc.)
    await this.attachmentRepository.remove(attachment);
  }
}
