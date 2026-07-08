import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Flight } from '../flight.entity';
import { FlightsSeed } from '../flights.seed';
import { Seat, SeatClass, SeatStatus } from './seat.entity';

const ECONOMY_ROWS = [1, 2, 3, 4];
const BUSINESS_ROWS = [5, 6];
const SEAT_LETTERS = ['A', 'B'];

function buildSeatsForFlight(flightId: number): Array<Omit<Seat, 'id'>> {
  const seats: Array<Omit<Seat, 'id'>> = [];

  for (const row of [...BUSINESS_ROWS, ...ECONOMY_ROWS]) {
    const seatClass: SeatClass = BUSINESS_ROWS.includes(row) ? 'business' : 'economy';
    for (const letter of SEAT_LETTERS) {
      seats.push({
        flightId,
        seatNumber: `${row}${letter}`,
        class: seatClass,
        status: 'available',
      });
    }
  }

  const bookedStatus: SeatStatus = 'booked';
  seats[seats.length - 1].status = bookedStatus;

  return seats;
}

@Injectable()
export class SeatsSeed implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeatsSeed.name);

  public constructor(
    @InjectRepository(Seat)
    private readonly seatsRepository: Repository<Seat>,
    @InjectRepository(Flight)
    private readonly flightsRepository: Repository<Flight>,
    private readonly flightsSeed: FlightsSeed,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    void this.flightsSeed;

    const flights = await this.flightsRepository.find();
    let seededFlights = 0;

    for (const flight of flights) {
      const existingSeats = await this.seatsRepository.count({ where: { flightId: flight.id } });
      if (existingSeats > 0) {
        continue;
      }

      const seats = buildSeatsForFlight(flight.id).map((seat) => this.seatsRepository.create(seat));
      await this.seatsRepository.save(seats);
      seededFlights += 1;
    }

    if (seededFlights > 0) {
      this.logger.log(`Se sembraron asientos para ${seededFlights} vuelo(s)`);
    }
  }
}
