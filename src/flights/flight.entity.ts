import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type FlightStatus = 'available' | 'cancelled';

@Entity('flights')
export class Flight {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  origin: string;

  @Column()
  destination: string;

  @Column({ type: 'timestamp' })
  departureTime: Date;

  @Column({ type: 'timestamp' })
  arrivalTime: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: string;

  @Column({ default: 'available' })
  status: FlightStatus;
}
