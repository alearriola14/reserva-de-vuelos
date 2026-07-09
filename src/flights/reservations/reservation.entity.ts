import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type ReservationStatus = 'pending' | 'confirmed' | 'cancelled';

@Entity('reservations')
export class Reservation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  flightId: number;

  @Column()
  seatId: number;

  @Column()
  passengerName: string;

  @Column()
  passengerEmail: string;

  @Column({ default: 'pending' })
  status: ReservationStatus;

  @Column({ type: 'varchar', nullable: true, unique: true })
  confirmationCode: string | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
