import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Cache } from 'cache-manager';
import { Repository } from 'typeorm';
import { Flight } from './flight.entity';

export type SearchFlightsQuery = {
  origin?: string;
  destination?: string;
  date?: string;
};

export type SearchFlightsResponse = {
  source: 'database' | 'redis';
  flights: Flight[];
};

const CACHE_TTL_MS = 60_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SEARCH_CACHE_PATTERN = 'flights:search:*';

type RedisLikeClient = {
  keys(pattern: string): Promise<string[]>;
  del(keys: string[]): Promise<number>;
};

@Injectable()
export class FlightsService {
  private readonly logger = new Logger(FlightsService.name);

  public constructor(
    @InjectRepository(Flight)
    private readonly flightsRepository: Repository<Flight>,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  public async search(query: SearchFlightsQuery): Promise<SearchFlightsResponse> {
    const origin = this.normalizeFilter(query.origin);
    const destination = this.normalizeFilter(query.destination);
    const date = this.normalizeDate(query.date);

    const cacheKey = this.buildCacheKey(origin, destination, date);

    const cachedFlights = await this.cacheManager.get<Flight[]>(cacheKey);
    if (cachedFlights) {
      this.logger.log(`Cache hit: ${cacheKey}`);
      return { source: 'redis', flights: cachedFlights };
    }

    this.logger.log(`Cache miss: ${cacheKey}`);
    const flights = await this.findInDatabase(origin, destination, date);

    await this.cacheManager.set(cacheKey, flights, CACHE_TTL_MS);

    return { source: 'database', flights };
  }

  public async invalidateSearchCache(): Promise<void> {
    for (const store of this.cacheManager.stores) {
      const client = (store.store as { client?: RedisLikeClient }).client;
      if (!client || typeof client.keys !== 'function') {
        continue;
      }

      const keys = await client.keys(SEARCH_CACHE_PATTERN);
      if (keys.length > 0) {
        await client.del(keys);
      }
    }
  }

  private buildCacheKey(origin: string | null, destination: string | null, date: string | null): string {
    return `flights:search:${origin ?? 'any'}:${destination ?? 'any'}:${date ?? 'any'}`;
  }

  private normalizeFilter(value?: string): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed.toUpperCase() : null;
  }

  private normalizeDate(value?: string): string | null {
    if (!value) {
      return null;
    }

    if (!DATE_PATTERN.test(value)) {
      throw new BadRequestException('date debe tener el formato YYYY-MM-DD');
    }

    return value;
  }

  private async findInDatabase(
    origin: string | null,
    destination: string | null,
    date: string | null,
  ): Promise<Flight[]> {
    const queryBuilder = this.flightsRepository.createQueryBuilder('flight');

    if (origin) {
      queryBuilder.andWhere('flight.origin ILIKE :origin', { origin });
    }

    if (destination) {
      queryBuilder.andWhere('flight.destination ILIKE :destination', { destination });
    }

    if (date) {
      const startOfDay = new Date(`${date}T00:00:00.000Z`);
      const endOfDay = new Date(`${date}T23:59:59.999Z`);
      queryBuilder.andWhere('flight.departureTime BETWEEN :startOfDay AND :endOfDay', {
        startOfDay,
        endOfDay,
      });
    }

    return queryBuilder.orderBy('flight.departureTime', 'ASC').getMany();
  }
}
