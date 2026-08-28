import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { NotesService } from '../services/notes.service';

// Reusing types/guards from main controller or defining locally if needed
// In a real app, these would be exported from a common auth module
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
class JwtAuthGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchHttp().getRequest();
    // In real implementation, this would extract user from JWT
    if (!request.user) {
      request.user = { userId: 'mock-user-id' }; 
    }
    return true;
  }
}

interface AuthenticatedRequest extends Request {
  user: { userId: string; role?: string };
}

@ApiTags('task-notes')
@UseGuards(JwtAuthGuard)
@Controller('tasks/:taskId/notes')
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Post()
  @ApiOperation({ summary: 'Add a note to a task' })
  @ApiResponse({ status: 201, description: 'Note added successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async addNote(
    @Param('taskId') taskId: string,
    @Body('content') content: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.notesService.addNote(taskId, req.user.userId, content);
  }

  @Get()
  @ApiOperation({ summary: 'Get all notes for a task' })
  @ApiResponse({ status: 200, description: 'Returns all notes for the task.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getNotes(@Param('taskId') taskId: string) {
    return this.notesService.getNotesByTask(taskId);
  }

  @Put(':noteId')
  @ApiOperation({ summary: 'Update own note' })
  @ApiResponse({ status: 200, description: 'Note updated successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'Note not found.' })
  async updateNote(
    @Param('noteId') noteId: string,
    @Body('content') content: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.notesService.updateNote(noteId, req.user.userId, content);
  }

  @Delete(':noteId')
  @ApiOperation({ summary: 'Delete own note' })
  @ApiResponse({ status: 200, description: 'Note deleted successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'Note not found.' })
  async deleteNote(
    @Param('noteId') noteId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.notesService.deleteNote(noteId, req.user.userId);
    return { success: true };
  }
}
