import { EntityManager, In } from 'typeorm';
import { Database } from '../database/Database';
import { MafiaEvent, MafiaStatus } from '../models/MafiaEvent';
import { MafiaParticipant } from '../models/MafiaParticipant';
import { Gender } from '../models/Gender';
import { MafiaRole } from '../models/MafiaRole';
import { User } from '../models/User';
import { ConflictError } from '../utils/errors';
import {
  MAFIA_MIN_PLAYERS,
  RoleCounts,
  dealRoles,
  isMafiaTeamRole,
  suggestRoleCounts,
  validateRoleCounts,
} from '../utils/mafiaDeal';

export interface MafiaEventInput {
  title: string;
  description?: string | null;
  starts_at?: Date | null;
  place?: string | null;
  show_mafia_team?: boolean;
  assign_seats?: boolean;
  max_players?: number;
}

export interface MafiaDealtPlayer {
  user: User;
  role: MafiaRole;
  seat: number | null;
  variant: number;
}

export interface MafiaDealResult {
  event: MafiaEvent;
  round: number;
  players: MafiaDealtPlayer[];
}

export interface MafiaTeammate {
  name: string;
  role: MafiaRole;
  seat: number | null;
}

export interface MafiaCard {
  round: number;
  role: MafiaRole;
  /** The card owner's own gender: the client needs it for the role name on the card. */
  gender: Gender | null;
  seat: number | null;
  variant: number;
  teammates: MafiaTeammate[];
}

export interface MafiaLayoutRow {
  user: User;
  role: MafiaRole | null;
  seat: number | null;
}

export class MafiaService {
  constructor(private readonly db: Database) {}

  async createEvent(groupId: number, hostId: number, input: MafiaEventInput): Promise<MafiaEvent> {
    const repo = this.db.getRepository(MafiaEvent);
    const saved = await repo.save(repo.create({
      group_id: groupId,
      host_id: hostId,
      title: input.title,
      description: input.description ?? null,
      starts_at: input.starts_at ?? null,
      place: input.place ?? null,
      show_mafia_team: input.show_mafia_team ?? true,
      assign_seats: input.assign_seats ?? false,
      max_players: input.max_players ?? 10,
      status: MafiaStatus.REGISTRATION,
    }));
    // Notifications need the group (chat id), so hand back the event with it loaded
    return (await this.getEvent(saved.id)) ?? saved;
  }

  /** Loaded with the group and the host. */
  async getEvent(eventId: number): Promise<MafiaEvent | null> {
    return this.db.getRepository(MafiaEvent).findOne({ where: { id: eventId }, relations: ['group', 'host'] });
  }

  async listGroupEvents(
    groupId: number,
    userId: number,
  ): Promise<Array<{ event: MafiaEvent; participantsCount: number; joined: boolean; isHost: boolean }>> {
    const events = await this.db.getRepository(MafiaEvent).find({
      where: { group_id: groupId },
      relations: ['host'],
      order: { created_at: 'DESC', id: 'DESC' },
    });
    if (events.length === 0) return [];

    // Only ids: roles never leave the database through the list
    const participants = await this.db.getRepository(MafiaParticipant).find({
      where: { event_id: In(events.map((e) => e.id)) },
      select: ['id', 'event_id', 'user_id'],
    });

    return events.map((event) => {
      const own = participants.filter((p) => p.event_id === event.id);
      return {
        event,
        participantsCount: own.length,
        joined: own.some((p) => p.user_id === userId),
        isHost: event.host_id === userId,
      };
    });
  }

  async getParticipants(eventId: number): Promise<MafiaParticipant[]> {
    return this.db.getRepository(MafiaParticipant).find({
      where: { event_id: eventId },
      relations: ['user'],
      order: { joined_at: 'ASC', id: 'ASC' },
    });
  }

  async join(eventId: number, userId: number): Promise<void> {
    await this.db.dataSource.transaction(async (manager) => {
      // FOR UPDATE, not FOR SHARE: two concurrent joins under a shared lock would both pass the
      // max_players count below and overfill the evening.
      const event = await this.lockEvent(manager, eventId, 'pessimistic_write', [MafiaStatus.REGISTRATION]);
      if (event.host_id === userId) throw new ConflictError('Host cannot play');

      const repo = manager.getRepository(MafiaParticipant);
      if (await repo.findOne({ where: { event_id: eventId, user_id: userId } })) {
        throw new ConflictError('Already joined');
      }
      if ((await repo.count({ where: { event_id: eventId } })) >= event.max_players) {
        throw new ConflictError('Event is full');
      }
      await repo.save(repo.create({ event_id: eventId, user_id: userId }));
    });
  }

  async leave(eventId: number, userId: number): Promise<void> {
    await this.removeFromRegistration(eventId, userId);
  }

  /** Host / admin use; unlike leaving on one's own it also works after registration was closed. */
  async removeParticipant(eventId: number, userId: number): Promise<void> {
    await this.removeFromRegistration(eventId, userId, [MafiaStatus.REGISTRATION, MafiaStatus.CLOSED]);
  }

  /** Stops registration early (roles are not dealt yet); needs enough players to play. */
  async closeRegistration(eventId: number): Promise<void> {
    await this.db.dataSource.transaction(async (manager) => {
      const event = await this.lockEvent(manager, eventId, 'pessimistic_write', [MafiaStatus.REGISTRATION]);

      const count = await manager.getRepository(MafiaParticipant).count({ where: { event_id: eventId } });
      if (count < MAFIA_MIN_PLAYERS) throw new ConflictError('Not enough players');

      event.status = MafiaStatus.CLOSED;
      await manager.getRepository(MafiaEvent).save(event);
    });
  }

  /** Remembers the group message that holds the live card of the event. */
  async setCardMessage(eventId: number, chatId: number, messageId: number): Promise<void> {
    await this.db.getRepository(MafiaEvent).update(eventId, { card_chat_id: String(chatId), card_message_id: messageId });
  }

  /**
   * Deals roles to every participant; allowed from registration (closes it implicitly), after closing,
   * and again after a deal (the next game of the evening).
   * `counts` defaults to the layout of the last deal (if it still fits the player count), then to the suggestion.
   */
  async deal(eventId: number, counts?: RoleCounts): Promise<MafiaDealResult> {
    return this.db.dataSource.transaction(async (manager) => {
      // FOR UPDATE: join() holds FOR SHARE on the event row, so nobody can join between
      // reading the participant list below and the commit (they would end up without a role).
      const event = await this.lockEvent(manager, eventId, 'pessimistic_write', [
        MafiaStatus.REGISTRATION,
        MafiaStatus.CLOSED,
        MafiaStatus.DEALT,
      ]);

      const repo = manager.getRepository(MafiaParticipant);
      const participants = await repo.find({
        where: { event_id: eventId },
        relations: ['user'],
        order: { joined_at: 'ASC', id: 'ASC' },
      });
      const n = participants.length;

      const stored = event.roles_config as RoleCounts | null | undefined;
      const storedFits = !!stored && Object.values(stored).reduce((a, b) => a + b, 0) === n;
      const used = counts ?? (storedFits ? stored! : suggestRoleCounts(n));
      validateRoleCounts(used, n);

      const dealt = dealRoles(participants.map((p) => p.user_id), used, {
        assignSeats: event.assign_seats,
        genders: new Map(participants.map((p) => [p.user_id, p.user.gender ?? null])),
      });
      for (const p of participants) {
        const d = dealt.get(p.user_id)!;
        p.role = d.role;
        p.seat = d.seat;
        p.card_variant = d.variant;
      }
      await repo.save(participants);

      event.round += 1;
      event.status = MafiaStatus.DEALT;
      event.dealt_at = new Date();
      event.roles_config = { ...used };
      await manager.getRepository(MafiaEvent).save(event);

      return {
        event,
        round: event.round,
        players: participants.map((p) => ({
          user: p.user,
          role: p.role!,
          seat: p.seat ?? null,
          variant: p.card_variant!,
        })),
      };
    });
  }

  /** Back to registration after closing or a deal; the round counter is kept. */
  async reopen(eventId: number): Promise<void> {
    await this.db.dataSource.transaction(async (manager) => {
      const event = await this.lockEvent(manager, eventId, 'pessimistic_write', [MafiaStatus.CLOSED, MafiaStatus.DEALT]);

      await manager.getRepository(MafiaParticipant).update(
        { event_id: eventId },
        { role: null, seat: null, card_variant: null },
      );

      event.status = MafiaStatus.REGISTRATION;
      await manager.getRepository(MafiaEvent).save(event);
    });
  }

  async finish(eventId: number): Promise<void> {
    await this.db.dataSource.transaction(async (manager) => {
      const event = await this.lockEvent(manager, eventId, 'pessimistic_write', [
        MafiaStatus.REGISTRATION,
        MafiaStatus.CLOSED,
        MafiaStatus.DEALT,
      ]);
      event.status = MafiaStatus.FINISHED;
      await manager.getRepository(MafiaEvent).save(event);
    });
  }

  async deleteEvent(eventId: number): Promise<void> {
    await this.db.getRepository(MafiaEvent).delete(eventId);
  }

  /**
   * The caller's own card. Other players' roles are read only for a mafia-team caller
   * when the evening shows the mafia to itself; nobody else's role is ever loaded.
   */
  async getMyCard(eventId: number, userId: number): Promise<MafiaCard | null> {
    const event = await this.db.getRepository(MafiaEvent).findOne({ where: { id: eventId } });
    if (!event || event.status !== MafiaStatus.DEALT) return null;

    const repo = this.db.getRepository(MafiaParticipant);
    const mine = await repo.findOne({ where: { event_id: eventId, user_id: userId }, relations: ['user'] });
    if (!mine?.role || mine.card_variant == null) return null;

    let teammates: MafiaTeammate[] = [];
    if (event.show_mafia_team && isMafiaTeamRole(mine.role)) {
      const all = await repo.find({
        where: { event_id: eventId },
        relations: ['user'],
        order: { joined_at: 'ASC', id: 'ASC' },
      });
      teammates = all
        .filter((p) => p.user_id !== userId && p.role && isMafiaTeamRole(p.role))
        .map((p) => ({ name: p.user.fullName, role: p.role!, seat: p.seat ?? null }));
    }

    return {
      round: event.round,
      role: mine.role,
      gender: mine.user?.gender ?? null,
      seat: mine.seat ?? null,
      variant: mine.card_variant,
      teammates,
    };
  }

  /** Every player with the role; the caller must restrict this to the host. */
  async getLayout(eventId: number): Promise<MafiaLayoutRow[]> {
    const participants = await this.getParticipants(eventId);
    return participants.map((p) => ({ user: p.user, role: p.role ?? null, seat: p.seat ?? null }));
  }

  private async removeFromRegistration(
    eventId: number,
    userId: number,
    allowed: MafiaStatus[] = [MafiaStatus.REGISTRATION],
  ): Promise<void> {
    await this.db.dataSource.transaction(async (manager) => {
      await this.lockEvent(manager, eventId, 'pessimistic_read', allowed);

      const repo = manager.getRepository(MafiaParticipant);
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
    allowed: MafiaStatus[],
  ): Promise<MafiaEvent> {
    const event = await manager.getRepository(MafiaEvent).findOne({ where: { id: eventId }, lock: { mode } });
    if (!event) throw new ConflictError('Event not found');

    if (!allowed.includes(event.status)) {
      throw new ConflictError(rejectionMessage(event.status));
    }
    return event;
  }
}

function rejectionMessage(actual: MafiaStatus): string {
  if (actual === MafiaStatus.FINISHED) return 'Event finished';
  if (actual === MafiaStatus.CLOSED) return 'Registration closed';
  return actual === MafiaStatus.DEALT ? 'Roles already dealt' : 'Roles not dealt';
}
