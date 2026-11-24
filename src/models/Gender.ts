/**
 * Player gender. Lives in its own file so that both the entities and the plain
 * utilities (role names, card art) can import it without pulling in TypeORM entities.
 */
export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
}

/** Runtime check for a value coming from the outside (request body, database row). */
export function isGender(value: unknown): value is Gender {
  return value === Gender.MALE || value === Gender.FEMALE;
}
