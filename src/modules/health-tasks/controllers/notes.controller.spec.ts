import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { NotesController } from './notes.controller';
import { NotesService } from '../services/notes.service';

describe('NotesController (integration)', () => {
  let app: INestApplication;

  const mockNotesService = {
    addNote: jest.fn(),
    updateNote: jest.fn(),
    deleteNote: jest.fn(),
    getNotesByTask: jest.fn(),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotesController],
      providers: [{ provide: NotesService, useValue: mockNotesService }],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  it('GET /tasks/:taskId/notes returns 200 with note list', async () => {
    mockNotesService.getNotesByTask.mockResolvedValue([{ id: 'n1', content: 'hello' }]);
    const res = await request(app.getHttpServer()).get('/tasks/t1/notes');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /tasks/:taskId/notes creates a note and returns 201', async () => {
    mockNotesService.addNote.mockResolvedValue({ id: 'n1', content: 'test note', taskId: 't1' });
    const res = await request(app.getHttpServer())
      .post('/tasks/t1/notes')
      .send({ content: 'test note' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id', 'n1');
  });

  it('DELETE /tasks/:taskId/notes/:noteId returns 200', async () => {
    mockNotesService.deleteNote.mockResolvedValue(undefined);
    const res = await request(app.getHttpServer()).delete('/tasks/t1/notes/n1');
    expect(res.status).toBe(200);
  });
});
