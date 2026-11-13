import { EntityManager, In } from 'typeorm';
import { Database } from '../database/Database';
import { SantaEvent, SantaStatus } from '../models/SantaEvent';
import { SantaParticipant } from '../models/SantaParticipant';
import { User } from '../models/User';
import { ConflictError } from '../utils/errors';
import { buildSantaCycle, SANTA_MIN_PARTICIPANTS } from '../utils/santaDraw';

export interface SantaEventInput {
  title: string;
  description?: string | null;
  budget?: string | null;
  exchange_date?: string | null;
}

export interface SantaAssignment {
  giver: User;
  receiver: User;
  receiverWishlist: string | null;
}

export class SantaService {
  constructor(private readonly db: Database) {}

  async createEvent(groupId: number, creatorId: number, input: SantaEventInput): Promise<SantaEvent> {
    const repo = this.db.getRepository(SantaEvent);
    const saved = await repo.save(repo.create({
      group_id: groupId,
      created_by: creatorId,
      title: input.title,
      description: input.description ?? null,
      budget: input.budget ?? null,
      exchange_date: input.exchange_date ?? null,
      status: SantaStatus.REGISTRATION,
    }));
    // Notifications need the group (chat id), so hand back the event with it loaded
    return (await this.getEvent(saved.id)) ?? saved;
  }

  async getEvent(eventId: number): Promise<SantaEvent | null> {
    return this.db.getRepository(SantaEvent).findOne({ where: { id: eventId }, relations: ['group'] });
  }

  async listGroupEvents(
    groupId: number,
    userId: number,
  ): Promise<Array<{ event: SantaEvent; participantsCount: number; joined: boolean }>> {
    const events = await this.db.getRepository(SantaEvent).find({
      where: { group_id: groupId },
      order: { created_at: 'DESC', id: 'DESC' },
    });
    if (events.length === 0) return [];

    const participants = await this.db.getRepository(SantaParticipant).find({
      where: { event_id: In(events.map((e) => e.id)) },
      select: ['id', 'event_id', 'user_id'],
    });

    return events.map((event) => {
      const own = participants.filter((p) => p.event_id === event.id);
      return {
        event,
        participantsCount: own.length,
        joined: own.some((p) => p.user_id === userId),
      };
    });
  }

  async getParticipants(eventId: number): Promise<SantaParticipant[]> {
    return this.db.getRepository(SantaParticipant).find({
      where: { event_id: eventId },
      relations: ['user'],
      order: { joined_at: 'ASC', id: 'ASC' },
    });
  }

  async join(eventId: number, userId: number, wishlist?: string | null): Promise<void> {
    await this.db.dataSource.transaction(async (manager) => {
      await this.lockEvent(manager, eventId, 'pessimistic_read', [SantaStatus.REGISTRATION]);

      const repo = manager.getRepository(SantaParticipant);
      if (await repo.findOne({ where: { event_id: eventId, user_id: userId } })) {
        throw new ConflictError('Already joined');
      }
      await repo.save(repo.create({ event_id: eventId, user_id: userId, wishlist: wishlist ?? null }));
    });
  }

  async leave(eventId: number, userId: number): Promise<void> {
    await this.removeFromRegistration(eventId, userId);
  }

  /** Admin use; same rules as leaving on one's own. */
  async removeParticipant(eventId: number, userId: number): Promise<void> {
    await this.removeFromRegistration(eventId, userId);
  }

  /**
   * Returns the user who gives to this user (only after the draw) so the caller can DM them.
   * That relation is never exposed through the API.
   */
  async updateWishlist(eventId: number, userId: number, wishlist: string | null): Promise<{ santa: User | null }> {
    return this.db.dataSource.transaction(async (manager) => {
      const event = await this.lockEvent(manager, eventId, 'pessimistic_read', [
        SantaStatus.REGISTRATION,
        SantaStatus.DRAWN,
      ]);

      const repo = manager.getRepository(SantaParticipant);
      const mine = await repo.findOne({ where: { event_id: eventId, user_id: userId } });
      if (!mine) throw new ConflictError('Not joined');

      mine.wishlist = wishlist;
      await repo.save(mine);

      if (event.status !== SantaStatus.DRAWN) return { santa: null };
      const santaRow = await repo.findOne({
        where: { event_id: eventId, receiver_id: userId },
        relations: ['user'],
      });
      return { santa: santaRow?.user ?? null };
    });
  }

  async draw(eventId: number): Promise<SantaAssignment[]> {
    return this.db.dataSource.transaction(async (manager) => {
      // FOR UPDATE: join() holds FOR SHARE on the event row, so nobody can join between
      // reading the participant list below and the commit (they would end up without a pair).
      const event = await this.lockEvent(manager, eventId, 'pessimistic_write', [SantaStatus.REGISTRATION]);

      const repo = manager.getRepository(SantaParticipant);
      const participants = await repo.find({
        where: { event_id: eventId },
        relations: ['user'],
        order: { joined_at: 'ASC', id: 'ASC' },
      });
      if (participants.length < SANTA_MIN_PARTICIPANTS) throw new ConflictError('Not enough participants');

      const cycle = buildSantaCycle(participants.map((p) => p.user_id));
      const byUserId = new Map(participants.map((p) => [p.user_id, p]));
      for (const p of participants) p.receiver_id = cycle.get(p.user_id)!;
      await repo.save(participants);

      event.status = SantaStatus.DRAWN;
      event.drawn_at = new Date();
      await manager.getRepository(SantaEvent).save(event);

      return participants.map((giver) => {
        const receiver = byUserId.get(giver.receiver_id!)!;
        return { giver: giver.user, receiver: receiver.user, receiverWishlist: receiver.wishlist ?? null };
      });
    });
  }

  async resetDraw(eventId: number): Promise<void> {
    await this.db.dataSource.transaction(async (manager) => {
      const event = await this.lockEvent(manager, eventId, 'pessimistic_write', [SantaStatus.DRAWN]);

      await manager.getRepository(SantaParticipant).update({ event_id: eventId }, { receiver_id: null });

      event.status = SantaStatus.REGISTRATION;
      event.drawn_at = null;
      await manager.getRepository(SantaEvent).save(event);
    });
  }

  async finish(eventId: number): Promise<void> {
    await this.db.dataSource.transaction(async (manager) => {
      const event = await this.lockEvent(manager, eventId, 'pessimistic_write', [SantaStatus.DRAWN]);
      event.status = SantaStatus.FINISHED;
      await manager.getRepository(SantaEvent).save(event);
    });
  }

  async deleteEvent(eventId: number): Promise<void> {
    await this.db.getRepository(SantaEvent).delete(eventId);
  }

  /** Reads only the caller's own row: nobody else's pair is ever loaded for a participant. */
  async getMyAssignment(eventId: number, userId: number): Promise<{ receiver: User; wishlist: string | null } | null> {
    const event = await this.db.getRepository(SantaEvent).findOne({ where: { id: eventId } });
    if (!event || event.status === SantaStatus.REGISTRATION) return null;

    const repo = this.db.getRepository(SantaParticipant);
    const mine = await repo.findOne({ where: { event_id: eventId, user_id: userId }, relations: ['receiver'] });
    if (!mine?.receiver_id || !mine.receiver) return null;

    const receiverRow = await repo.findOne({ where: { event_id: eventId, user_id: mine.receiver_id } });
    return { receiver: mine.receiver, wishlist: receiverRow?.wishlist ?? null };
  }

  private async removeFromRegistration(eventId: number, userId: number): Promise<void> {
    await this.db.dataSource.transaction(async (manager) => {
      await this.lockEvent(manager, eventId, 'pessimistic_read', [SantaStatus.REGISTRATION]);

      const repo = manager.getRepository(SantaParticipant);
      const row = await repo.findOne({ where: { event_id: eventId, user_id: userId } });
      if (!row) throw new ConflictError('Not joined');
      await repo.delete(row.id);
    });
  }

  /** Locks the event row, then checks its status; ConflictError when it is not one of the allowed ones. */
  private async lockEvent(
    manager: EntityManager,
    eventId: number,
    mode: 'pessimistic_read' | 'pessimistic_write',
    allowed: SantaStatus[],
  ): Promise<SantaEvent> {
    const event = await manager.getRepository(SantaEvent).findOne({ where: { id: eventId }, lock: { mode } });
    if (!event) throw new ConflictError('Event not found');

    if (!allowed.includes(event.status)) {
      throw new ConflictError(rejectionMessage(event.status, allowed));
    }
    return event;
  }
}

function rejectionMessage(actual: SantaStatus, allowed: SantaStatus[]): string {
  if (actual === SantaStatus.FINISHED) return 'Event finished';
  return allowed.includes(SantaStatus.REGISTRATION) ? 'Draw already done' : 'Draw not done';
}
