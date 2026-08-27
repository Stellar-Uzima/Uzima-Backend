import { NotFoundException } from '@nestjs/common';
import { AttachmentsService } from './attachments.service';
import { TaskAttachment } from '../../../database/entities/task-attachment.entity';

const mockAttachmentRepository = {
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  remove: jest.fn(),
};

const makeAttachment = (overrides: Partial<TaskAttachment> = {}): TaskAttachment =>
  ({
    id: 'attach-1',
    taskId: 'task-1',
    fileName: 'report.pdf',
    fileUrl: 'https://storage.example.com/report.pdf',
    fileType: 'application/pdf',
    fileSize: 204800,
    uploadedBy: 'user-1',
    createdAt: new Date('2026-01-15T10:00:00.000Z'),
    ...overrides,
  } as TaskAttachment);

describe('AttachmentsService', () => {
  let service: AttachmentsService;

  beforeEach(() => {
    service = new AttachmentsService(mockAttachmentRepository as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // createAttachment
  // ---------------------------------------------------------------------------
  describe('createAttachment', () => {
    it('creates and returns a new attachment', async () => {
      const fileData = {
        fileName: 'report.pdf',
        fileUrl: 'https://storage.example.com/report.pdf',
        fileType: 'application/pdf',
        fileSize: 204800,
        uploadedBy: 'user-1',
      };
      const attachment = makeAttachment();

      mockAttachmentRepository.create.mockReturnValue(attachment);
      mockAttachmentRepository.save.mockResolvedValue(attachment);

      const result = await service.createAttachment('task-1', fileData);

      expect(mockAttachmentRepository.create).toHaveBeenCalledWith({
        taskId: 'task-1',
        ...fileData,
      });
      expect(mockAttachmentRepository.save).toHaveBeenCalledWith(attachment);
      expect(result).toEqual(attachment);
    });

    it('creates an attachment without uploadedBy', async () => {
      const fileData = {
        fileName: 'image.png',
        fileUrl: 'https://storage.example.com/image.png',
        fileType: 'image/png',
        fileSize: 51200,
      };
      const attachment = makeAttachment({ uploadedBy: undefined, ...fileData });

      mockAttachmentRepository.create.mockReturnValue(attachment);
      mockAttachmentRepository.save.mockResolvedValue(attachment);

      const result = await service.createAttachment('task-2', fileData);

      expect(mockAttachmentRepository.create).toHaveBeenCalledWith({
        taskId: 'task-2',
        ...fileData,
      });
      expect(result).toEqual(attachment);
    });
  });

  // ---------------------------------------------------------------------------
  // getAttachmentsByTask
  // ---------------------------------------------------------------------------
  describe('getAttachmentsByTask', () => {
    it('returns all attachments for a task ordered by createdAt DESC', async () => {
      const attachments = [
        makeAttachment({ id: 'attach-2', createdAt: new Date('2026-01-16T00:00:00.000Z') }),
        makeAttachment({ id: 'attach-1', createdAt: new Date('2026-01-15T00:00:00.000Z') }),
      ];

      mockAttachmentRepository.find.mockResolvedValue(attachments);

      const result = await service.getAttachmentsByTask('task-1');

      expect(mockAttachmentRepository.find).toHaveBeenCalledWith({
        where: { taskId: 'task-1' },
        order: { createdAt: 'DESC' },
      });
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('attach-2');
    });

    it('returns an empty array when no attachments exist for the task', async () => {
      mockAttachmentRepository.find.mockResolvedValue([]);

      const result = await service.getAttachmentsByTask('task-999');

      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // findOne
  // ---------------------------------------------------------------------------
  describe('findOne', () => {
    it('returns the attachment when it exists', async () => {
      const attachment = makeAttachment();
      mockAttachmentRepository.findOne.mockResolvedValue(attachment);

      const result = await service.findOne('attach-1');

      expect(mockAttachmentRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'attach-1' },
      });
      expect(result).toEqual(attachment);
    });

    it('throws NotFoundException when attachment does not exist', async () => {
      mockAttachmentRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('missing-id')).rejects.toThrow(NotFoundException);
      await expect(service.findOne('missing-id')).rejects.toThrow(
        'Attachment with ID missing-id not found',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // deleteAttachment
  // ---------------------------------------------------------------------------
  describe('deleteAttachment', () => {
    it('deletes an existing attachment', async () => {
      const attachment = makeAttachment();
      mockAttachmentRepository.findOne.mockResolvedValue(attachment);
      mockAttachmentRepository.remove.mockResolvedValue(undefined);

      await service.deleteAttachment('attach-1');

      expect(mockAttachmentRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'attach-1' },
      });
      expect(mockAttachmentRepository.remove).toHaveBeenCalledWith(attachment);
    });

    it('throws NotFoundException when deleting a non-existent attachment', async () => {
      mockAttachmentRepository.findOne.mockResolvedValue(null);

      await expect(service.deleteAttachment('missing-id')).rejects.toThrow(NotFoundException);
      await expect(service.deleteAttachment('missing-id')).rejects.toThrow(
        'Attachment with ID missing-id not found',
      );
      expect(mockAttachmentRepository.remove).not.toHaveBeenCalled();
    });
  });
});
