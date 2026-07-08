import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type SeatClass = 'economy' | 'business';
export type SeatStatus = 'available' | 'held' | 'booked';

@Entity('seats')
export class Seat {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  flightId: number;

  @Column()
  seatNumber: string;

  @Column()
  class: SeatClass;

  @Column({ default: 'available' })
  status: SeatStatus;
}
