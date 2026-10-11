import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { Sport } from './Sport';
import { Location } from './Location';

@Entity('sport_locations')
@Index('uq_sport_locations_sport_location', ['sport_id', 'location_id'], { unique: true })
export class SportLocation {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  sport_id!: number;

  @ManyToOne(() => Sport, (sport) => sport.sportLocations)
  @JoinColumn({ name: 'sport_id' })
  sport!: Sport;

  @Column()
  location_id!: number;

  @ManyToOne(() => Location, (location) => location.sportLocations)
  @JoinColumn({ name: 'location_id' })
  location!: Location;

  @CreateDateColumn()
  created_at!: Date;
}
