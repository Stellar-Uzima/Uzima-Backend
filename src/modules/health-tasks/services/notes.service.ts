import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskNote } from '../../../database/entities/task-note.entity';

@Injectable()
export class NotesService {
  constructor(
    @InjectRepository(TaskNote)
    private readonly noteRepository: Repository<TaskNote>,
  ) {}

  async addNote(taskId: string, authorId: string, content: string): Promise<TaskNote> {
    const note = this.noteRepository.create({
      taskId,
      authorId,
      content,
    });
    return this.noteRepository.save(note);
  }

  async updateNote(noteId: string, userId: string, content: string): Promise<TaskNote> {
    const note = await this.noteRepository.findOne({ where: { id: noteId } });
    if (!note) {
      throw new NotFoundException(`Note with ID ${noteId} not found`);
    }

    if (note.authorId !== userId) {
      throw new ForbiddenException('You can only edit your own notes');
    }

    note.content = content;
    return this.noteRepository.save(note);
  }

  async deleteNote(noteId: string, userId: string): Promise<void> {
    const note = await this.noteRepository.findOne({ where: { id: noteId } });
    if (!note) {
      throw new NotFoundException(`Note with ID ${noteId} not found`);
    }

    if (note.authorId !== userId) {
      throw new ForbiddenException('You can only delete your own notes');
    }

    await this.noteRepository.remove(note);
  }

  async getNotesByTask(taskId: string): Promise<TaskNote[]> {
    return this.noteRepository.find({
      where: { taskId },
      order: { createdAt: 'DESC' },
      relations: ['author'],
    });
  }
}
