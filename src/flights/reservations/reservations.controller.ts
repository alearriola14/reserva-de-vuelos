import { Body, Controller, Delete, Param, ParseIntPipe, Patch } from '@nestjs/common';
import { Reservation } from './reservation.entity';
import { ReservationsService } from './reservations.service';
import { UpdateReservationDto } from './update-reservation.dto';

@Controller('reservations')
export class ReservationsController {
  public constructor(private readonly reservationsService: ReservationsService) {}

  @Patch(':id/confirm')
  public async confirmReservation(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<Reservation> {
    return this.reservationsService.confirmReservation(id);
  }

  @Patch(':id')
  public async changeReservation(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateReservationDto,
  ): Promise<Reservation> {
    return this.reservationsService.changeReservation(id, dto);
  }

  @Delete(':id')
  public async cancelReservation(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.reservationsService.cancelReservation(id);
  }
}
