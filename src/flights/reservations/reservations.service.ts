import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import type { Cache } from 'cache-manager';
import { DataSource, Repository } from 'typeorm';
import { Flight } from '../flight.entity';
import { FlightsService } from '../flights.service';
import { Seat } from '../seats/seat.entity';
import { CreateReservationDto } from './create-reservation.dto';
import { Reservation } from './reservation.entity';

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  public constructor(
    @InjectRepository(Flight)
    private readonly flightsRepository: Repository<Flight>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private readonly flightsService: FlightsService,
  ) {}

  public async createReservation(flightId: number, dto: CreateReservationDto): Promise<Reservation> {
    await this.assertFlightExists(flightId);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const seat = await queryRunner.manager.findOne(Seat, {
        where: { id: dto.seatId, flightId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!seat) {
        throw new NotFoundException(`No existe el asiento ${dto.seatId} para el vuelo ${flightId}`);
      }

      if (seat.status !== 'available') {
        throw new ConflictException(`El asiento ${seat.seatNumber} ya no está disponible para el vuelo ${flightId}`);
      }

      seat.status = 'held';
      await queryRunner.manager.save(seat);

      const reservation = queryRunner.manager.create(Reservation, {
        flightId,
        seatId: seat.id,
        passengerName: dto.passengerName,
        passengerEmail: dto.passengerEmail,
        status: 'pending',
        confirmationCode: null,
      });
      const savedReservation = await queryRunner.manager.save(reservation);

      await queryRunner.commitTransaction();

      this.logger.log(
        `Reserva creada: asiento ${seat.seatNumber} del vuelo ${flightId} para ${dto.passengerName} (status: pending)`,
      );

      await this.invalidateCaches(flightId);

      return savedReservation;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async assertFlightExists(flightId: number): Promise<void> {
    const flight = await this.flightsRepository.findOne({ where: { id: flightId } });
    if (!flight) {
      throw new NotFoundException(`No existe el vuelo ${flightId}`);
    }
  }

  private async invalidateCaches(flightId: number): Promise<void> {
    const seatsCacheKey = `flights:${flightId}:seats`;
    await this.cacheManager.del(seatsCacheKey);
    this.logger.log(`Cache invalidada: ${seatsCacheKey}`);

    await this.flightsService.invalidateSearchCache();
    this.logger.log('Cache de búsqueda invalidada');
  }
}
