import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Cache } from 'cache-manager';
import { Repository } from 'typeorm';
import { Flight } from '../flight.entity';
import { Seat, SeatStatus } from './seat.entity';

export type SeatMapResponse = {
  source: 'database' | 'redis';
  seats: Seat[];
};

const CACHE_TTL_MS = 30_000;
const VALID_STATUSES: SeatStatus[] = ['available', 'held', 'booked'];

@Injectable()
export class SeatsService {
  private readonly logger = new Logger(SeatsService.name);

  public constructor(
    @InjectRepository(Seat)
    private readonly seatsRepository: Repository<Seat>,
    @InjectRepository(Flight)
    private readonly flightsRepository: Repository<Flight>,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  public async getSeatMap(flightId: number): Promise<SeatMapResponse> {
    await this.assertFlightExists(flightId);

    const cacheKey = this.buildCacheKey(flightId);

    const cachedSeats = await this.cacheManager.get<Seat[]>(cacheKey);
    if (cachedSeats) {
      this.logger.log(`Cache hit: ${cacheKey}`);
      return { source: 'redis', seats: cachedSeats };
    }

    this.logger.log(`Cache miss: ${cacheKey}`);
    const seats = await this.seatsRepository.find({
      where: { flightId },
      order: { seatNumber: 'ASC' },
    });

    await this.cacheManager.set(cacheKey, seats, CACHE_TTL_MS);

    return { source: 'database', seats };
  }

  public async updateSeatStatus(flightId: number, seatId: number, status: string): Promise<Seat> {
    if (!VALID_STATUSES.includes(status as SeatStatus)) {
      throw new BadRequestException(`status debe ser uno de: ${VALID_STATUSES.join(', ')}`);
    }

    const seat = await this.seatsRepository.findOne({ where: { id: seatId, flightId } });
    if (!seat) {
      throw new NotFoundException(`No existe el asiento ${seatId} para el vuelo ${flightId}`);
    }

    seat.status = status as SeatStatus;
    const updatedSeat = await this.seatsRepository.save(seat);

    const cacheKey = this.buildCacheKey(flightId);
    await this.cacheManager.del(cacheKey);
    this.logger.log(`Cache invalidada: ${cacheKey}`);

    return updatedSeat;
  }

  private async assertFlightExists(flightId: number): Promise<void> {
    const flight = await this.flightsRepository.findOne({ where: { id: flightId } });
    if (!flight) {
      throw new NotFoundException(`No existe el vuelo ${flightId}`);
    }
  }

  private buildCacheKey(flightId: number): string {
    return `flights:${flightId}:seats`;
  }
}
