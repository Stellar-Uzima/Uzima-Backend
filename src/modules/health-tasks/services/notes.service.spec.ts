import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { NotesService } from './notes.service';
import { TaskNote } from '../../../database/entities/task-note.entity';

describe('NotesService', () => {
  let service: NotesService;

  const mockRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    remove: jest.fn(),
  };

  const taskId = 'task-1';
  const authorId = 'user-1';
  const otherId = 'user-2';
  const noteId = 'note-1';

  const baseNote: Partial<TaskNote> = {
    id: noteId,
    taskId,
    authorId,
    content: 'Test note',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotesService,
        { provide: getRepositoryToken(TaskNote), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<NotesService>(NotesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addNote', () => {
    it('creates and saves a note', async () => {
      mockRepo.create.mockReturnValue(baseNote);
      mockRepo.save.mockResolvedValue(baseNote);

      const result = await service.addNote(taskId, authorId, 'Test note');

      expect(mockRepo.create).toHaveBeenCalledWith({ taskId, authorId, content: 'Test note' });
      expect(mockRepo.save).toHaveBeenCalledWith(baseNote);
      expect(result).toEqual(baseNote);
    });
  });

  describe('updateNote', () => {
    it('updates content when note belongs to user', async () => {
      const note = { ...baseNote };
      mockRepo.findOne.mockResolvedValue(note);
      mockRepo.save.mockResolvedValue({ ...note, content: 'Updated' });

      const result = await service.updateNote(noteId, authorId, 'Updated');

      expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { id: noteId } });
      expect(result.content).toBe('Updated');
    });

    it('throws NotFoundException when note does not exist', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.updateNote(noteId, authorId, 'x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when user is not the author', async () => {
      mockRepo.findOne.mockResolvedValue({ ...baseNote });

      await expect(service.updateNote(noteId, otherId, 'x')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('deleteNote', () => {
    it('removes note when user is the author', async () => {
      const note = { ...baseNote };
      mockRepo.findOne.mockResolvedValue(note);
      mockRepo.remove.mockResolvedValue(undefined);

      await service.deleteNote(noteId, authorId);

      expect(mockRepo.remove).toHaveBeenCalledWith(note);
    });

    it('throws NotFoundException when note does not exist', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.deleteNote(noteId, authorId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when user is not the author', async () => {
      mockRepo.findOne.mockResolvedValue({ ...baseNote });

      await expect(service.deleteNote(noteId, otherId)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('getNotesByTask', () => {
    it('returns notes ordered by createdAt DESC with author relation', async () => {
      const notes = [baseNote];
      mockRepo.find.mockResolvedValue(notes);

      const result = await service.getNotesByTask(taskId);

      expect(mockRepo.find).toHaveBeenCalledWith({
        where: { taskId },
        order: { createdAt: 'DESC' },
        relations: ['author'],
      });
      expect(result).toEqual(notes);
    });

    it('returns empty array when no notes exist', async () => {
      mockRepo.find.mockResolvedValue([]);

      const result = await service.getNotesByTask(taskId);

      expect(result).toEqual([]);
    });
  });
});
