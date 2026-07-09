import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import type { Cache } from 'cache-manager';
import { DataSource, Repository } from 'typeorm';
import { Flight } from '../flight.entity';
import { FlightsService } from '../flights.service';
import { Seat } from '../seats/seat.entity';
import { randomUUID } from 'crypto';
import { CreateReservationDto } from './create-reservation.dto';
import { Reservation } from './reservation.entity';
import { UpdateReservationDto } from './update-reservation.dto';

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

  public async confirmReservation(id: number): Promise<Reservation> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const reservation = await queryRunner.manager.findOne(Reservation, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!reservation) {
        throw new NotFoundException(`No existe la reservación ${id}`);
      }

      if (reservation.status !== 'pending') {
        throw new ConflictException(`La reservación no está en estado pendiente`);
      }

      reservation.status = 'confirmed';
      reservation.confirmationCode = randomUUID();
      const savedReservation = await queryRunner.manager.save(reservation);

      await queryRunner.commitTransaction();

      this.logger.log(`Reserva confirmada: ${id}, código: ${reservation.confirmationCode}`);

      const cacheKey = `reservation:${id}`;
      await this.cacheManager.set(cacheKey, savedReservation, 60_000); // 60 seconds (greater than seat availability 30s)

      return savedReservation;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  public async changeReservation(id: number, dto: UpdateReservationDto): Promise<Reservation> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const reservation = await queryRunner.manager.findOne(Reservation, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!reservation) {
        throw new NotFoundException(`No existe la reservación ${id}`);
      }

      if (reservation.status === 'cancelled') {
        throw new ConflictException(`No se puede modificar una reservación cancelada`);
      }

      const originalFlight = await queryRunner.manager.findOne(Flight, { where: { id: reservation.flightId } });
      if (!originalFlight) throw new NotFoundException('Vuelo original no encontrado');

      const now = new Date();
      const timeDiff = originalFlight.departureTime.getTime() - now.getTime();
      const hoursDiff = timeDiff / (1000 * 60 * 60);

      if (hoursDiff < 24) {
        throw new BadRequestException('Los cambios solo se permiten hasta 24 horas antes de la salida original');
      }

      const newSeat = await queryRunner.manager.findOne(Seat, {
        where: { id: dto.seatId, flightId: dto.flightId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!newSeat) {
        throw new NotFoundException(`No existe el asiento ${dto.seatId} para el vuelo ${dto.flightId}`);
      }

      if (newSeat.status !== 'available') {
        throw new ConflictException(`El nuevo asiento ${newSeat.seatNumber} ya no está disponible`);
      }

      const oldSeat = await queryRunner.manager.findOne(Seat, {
        where: { id: reservation.seatId, flightId: reservation.flightId },
        lock: { mode: 'pessimistic_write' },
      });
      if (oldSeat) {
        oldSeat.status = 'available';
        await queryRunner.manager.save(oldSeat);
      }

      newSeat.status = 'held';
      await queryRunner.manager.save(newSeat);

      const oldFlightId = reservation.flightId;
      reservation.flightId = dto.flightId;
      reservation.seatId = dto.seatId;
      await this.cacheManager.del(`reservation:${id}`);
      
      const savedReservation = await queryRunner.manager.save(reservation);
      
      await queryRunner.commitTransaction();

      this.logger.log(`Reserva ${id} modificada al vuelo ${dto.flightId}, asiento ${dto.seatId}`);

      await this.invalidateCaches(oldFlightId);
      if (oldFlightId !== dto.flightId) {
        await this.invalidateCaches(dto.flightId);
      }

      return savedReservation;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  public async cancelReservation(id: number): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const reservation = await queryRunner.manager.findOne(Reservation, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!reservation) {
        throw new NotFoundException(`No existe la reservación ${id}`);
      }

      const seat = await queryRunner.manager.findOne(Seat, {
        where: { id: reservation.seatId, flightId: reservation.flightId },
        lock: { mode: 'pessimistic_write' },
      });

      if (seat) {
        seat.status = 'available';
        await queryRunner.manager.save(seat);
      }

      reservation.status = 'cancelled';
      await queryRunner.manager.save(reservation);

      await queryRunner.commitTransaction();

      this.logger.log(`Reserva cancelada: ${id}`);

      await this.invalidateCaches(reservation.flightId);
      await this.cacheManager.del(`reservation:${id}`);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
