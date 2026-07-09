import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Flight } from './flight.entity';
import { FlightsController } from './flights.controller';
import { FlightsSeed } from './flights.seed';
import { FlightsService } from './flights.service';
import { Reservation } from './reservations/reservation.entity';
import { ReservationsController } from './reservations/reservations.controller';
import { ReservationsService } from './reservations/reservations.service';
import { Seat } from './seats/seat.entity';
import { SeatsSeed } from './seats/seats.seed';
import { SeatsService } from './seats/seats.service';

@Module({
  imports: [TypeOrmModule.forFeature([Flight, Seat, Reservation])],
  controllers: [FlightsController, ReservationsController],
  providers: [FlightsService, FlightsSeed, SeatsService, SeatsSeed, ReservationsService],
})
export class FlightsModule {}
