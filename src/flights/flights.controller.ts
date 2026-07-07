import { Controller, Get, Query } from '@nestjs/common';
import { FlightsService, SearchFlightsResponse } from './flights.service';

@Controller('flights')
export class FlightsController {
  public constructor(private readonly flightsService: FlightsService) {}

  @Get()
  public async search(
    @Query('origin') origin?: string,
    @Query('destination') destination?: string,
    @Query('date') date?: string,
  ): Promise<SearchFlightsResponse> {
    return this.flightsService.search({ origin, destination, date });
  }
}
