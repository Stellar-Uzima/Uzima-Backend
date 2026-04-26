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
  NotFoundException,
  BadRequestException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';

@ApiTags('users')
@Controller('users')
export class UsersController {
  @Get()
  async findAll() {
    return { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    if (!id) {
      throw new NotFoundException('User not found');
    }
    return { id };
  }

  @Post()
  async create(@Body() body: any) {
    if (!body) {
      throw new BadRequestException('Invalid request body');
    }
    return body;
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any) {
    return { id, ...body };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return { deleted: id };
  }
}
