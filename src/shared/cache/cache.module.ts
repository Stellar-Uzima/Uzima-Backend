import { Module, Global } from '@nestjs/common';
import { CacheService } from './cache.service';
import { CacheInvalidationService } from './cache-invalidation.service';
import { CacheInterceptor } from '../../common/interceptors/cache.interceptor';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Reflector } from '@nestjs/core';

@Global()
@Module({
  providers: [
    CacheService,
    CacheInvalidationService,
    {
      provide: APP_INTERCEPTOR,
      useClass: CacheInterceptor,
    },
    Reflector,
  ],
  exports: [CacheService, CacheInvalidationService],
})
export class AppCacheModule {}
export class CacheModule {}
