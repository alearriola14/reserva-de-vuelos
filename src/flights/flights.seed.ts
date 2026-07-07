import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Flight } from './flight.entity';

const SAMPLE_FLIGHTS: Array<Omit<Flight, 'id'>> = [
  {
    origin: 'SAL',
    destination: 'MIA',
    departureTime: new Date('2026-07-10T08:00:00Z'),
    arrivalTime: new Date('2026-07-10T11:30:00Z'),
    price: '289.99',
    status: 'available',
  },
  {
    origin: 'SAL',
    destination: 'MIA',
    departureTime: new Date('2026-07-10T16:00:00Z'),
    arrivalTime: new Date('2026-07-10T19:30:00Z'),
    price: '245.5',
    status: 'available',
  },
  {
    origin: 'SAL',
    destination: 'MIA',
    departureTime: new Date('2026-07-12T08:00:00Z'),
    arrivalTime: new Date('2026-07-12T11:30:00Z'),
    price: '299.0',
    status: 'available',
  },
  {
    origin: 'SAL',
    destination: 'GUA',
    departureTime: new Date('2026-07-10T09:15:00Z'),
    arrivalTime: new Date('2026-07-10T10:10:00Z'),
    price: '120.0',
    status: 'available',
  },
  {
    origin: 'SAL',
    destination: 'GUA',
    departureTime: new Date('2026-07-11T14:00:00Z'),
    arrivalTime: new Date('2026-07-11T14:55:00Z'),
    price: '110.75',
    status: 'available',
  },
  {
    origin: 'SAL',
    destination: 'PTY',
    departureTime: new Date('2026-07-10T13:20:00Z'),
    arrivalTime: new Date('2026-07-10T15:05:00Z'),
    price: '175.25',
    status: 'available',
  },
  {
    origin: 'PTY',
    destination: 'SAL',
    departureTime: new Date('2026-07-13T18:00:00Z'),
    arrivalTime: new Date('2026-07-13T19:45:00Z'),
    price: '180.0',
    status: 'available',
  },
  {
    origin: 'MIA',
    destination: 'SAL',
    departureTime: new Date('2026-07-15T12:00:00Z'),
    arrivalTime: new Date('2026-07-15T15:20:00Z'),
    price: '260.0',
    status: 'available',
  },
  {
    origin: 'SAL',
    destination: 'MEX',
    departureTime: new Date('2026-07-14T07:30:00Z'),
    arrivalTime: new Date('2026-07-14T09:45:00Z'),
    price: '210.4',
    status: 'available',
  },
  {
    origin: 'MEX',
    destination: 'SAL',
    departureTime: new Date('2026-07-16T20:00:00Z'),
    arrivalTime: new Date('2026-07-16T22:15:00Z'),
    price: '215.9',
    status: 'cancelled',
  },
];

@Injectable()
export class FlightsSeed implements OnApplicationBootstrap {
  private readonly logger = new Logger(FlightsSeed.name);

  public constructor(
    @InjectRepository(Flight)
    private readonly flightsRepository: Repository<Flight>,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    const existingFlights = await this.flightsRepository.count();
    if (existingFlights > 0) {
      return;
    }

    await this.flightsRepository.save(SAMPLE_FLIGHTS.map((flight) => this.flightsRepository.create(flight)));
    this.logger.log(`Se sembraron ${SAMPLE_FLIGHTS.length} vuelos de ejemplo`);
  }
}
