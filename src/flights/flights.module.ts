import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Flight } from './flight.entity';
import { FlightsController } from './flights.controller';
import { FlightsSeed } from './flights.seed';
import { FlightsService } from './flights.service';

@Module({
  imports: [TypeOrmModule.forFeature([Flight])],
  controllers: [FlightsController],
  providers: [FlightsService, FlightsSeed],
})
export class FlightsModule {}
