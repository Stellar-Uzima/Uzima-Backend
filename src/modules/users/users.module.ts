import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserSearchService } from './services/user-search.service';
import { User } from '../../entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    CacheModule.register({
      ttl: 300, // 5 minutes default TTL
    }),
  ],
  controllers: [UsersController],
  providers: [UsersService, UserSearchService],
  exports: [UsersService, UserSearchService],
})
export class UsersModule {}
