import { Body, Controller, Get, Param, ParseIntPipe, Patch, Query } from '@nestjs/common';
import { FlightsService, SearchFlightsResponse } from './flights.service';
import { Seat } from './seats/seat.entity';
import { SeatMapResponse, SeatsService } from './seats/seats.service';

@Controller('flights')
export class FlightsController {
  public constructor(
    private readonly flightsService: FlightsService,
    private readonly seatsService: SeatsService,
  ) {  }

  @Get()
  public async search(
    @Query('origin') origin?: string,
    @Query('destination') destination?: string,
    @Query('date') date?: string,
  ): Promise<SearchFlightsResponse> {
    return this.flightsService.search({ origin, destination, date });
  }

  @Get(':id/seats')
  public async getSeats(@Param('id', ParseIntPipe) id: number): Promise<SeatMapResponse> {
    return this.seatsService.getSeatMap(id);
  }

  @Patch(':id/seats/:seatId')
  public async updateSeat(
    @Param('id', ParseIntPipe) id: number,
    @Param('seatId', ParseIntPipe) seatId: number,
    @Body('status') status: string,
  ): Promise<Seat> {
    return this.seatsService.updateSeatStatus(id, seatId, status);
  }
}
