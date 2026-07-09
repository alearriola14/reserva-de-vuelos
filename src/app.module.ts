import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisCacheModule } from './cache/redis-cache.module';
import { Flight } from './flights/flight.entity';
import { FlightsModule } from './flights/flights.module';
import { Reservation } from './flights/reservations/reservation.entity';
import { Seat } from './flights/seats/seat.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT ?? '5432', 10),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      entities: [Flight, Seat, Reservation],
      synchronize: true,
    }),
    RedisCacheModule,
    FlightsModule,
  ],
})
export class AppModule {}
