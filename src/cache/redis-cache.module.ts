import { createKeyv } from '@keyv/redis';
import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: () => {
        const host = process.env.REDIS_HOST ?? 'localhost';
        const port = process.env.REDIS_PORT ?? '6379';

        return {
          stores: [createKeyv(`redis://${host}:${port}`)],
        };
      },
    }),
  ],
  exports: [CacheModule],
})
export class RedisCacheModule {}
