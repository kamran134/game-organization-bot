import { IsNull, MoreThan, Not } from 'typeorm';
import { Database } from '../database/Database';
import { Game, GameStatus } from '../models/Game';
import { GameType } from '../models/GameType';
import { countCertainPlayers } from '../models/GameParticipant';
import { NotificationService } from './NotificationService';

export type CancelReason = 'manual' | 'min_not_reached';

/** A planned game becomes completed this long after it started. */
export const AUTO_COMPLETE_AFTER_MS = 3 * 3600 * 1000;

const HOUR_MS = 3600 * 1000;

/**
 * True when a planned game must be cancelled for lack of players: the registration lock moment
 * has passed, the game has not started, and confirmed + guests are below the minimum.
 * Trainings and games without a lock are never auto-cancelled.
 */
export function shouldAutoCancel(game: Game, now: Date): boolean {
  if (game.status !== GameStatus.PLANNED || game.type !== GameType.GAME) return false;
  if (!game.registration_lock_hours) return false;

  const startsAt = new Date(game.game_date).getTime();
  const lockAt = startsAt - game.registration_lock_hours * HOUR_MS;
  if (now.getTime() < lockAt || now.getTime() >= startsAt) return false;

  // Registration was locked from the start, so a small roster says nothing about interest
  if (new Date(game.created_at).getTime() >= lockAt) return false;

  return countCertainPlayers(game.participants) < game.min_participants;
}

export class GameLifecycleService {
  constructor(
    private readonly db: Database,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * planned -> cancelled. The conditional UPDATE makes the transition atomic: only the call that
   * actually changed the row returns true and notifies the group, so a manual cancel racing the
   * job (or two overlapping job runs) cannot double-post.
   */
  async cancel(gameId: number, reason: CancelReason): Promise<boolean> {
    const repo = this.db.getRepository(Game);
    const result = await repo.update({ id: gameId, status: GameStatus.PLANNED }, { status: GameStatus.CANCELLED });
    if (!result.affected) return false;

    // The transition is already committed; a failed notification must not turn it into an error
    try {
      const game = await repo.findOne({
        where: { id: gameId },
        relations: ['group', 'sport', 'location', 'participants', 'participants.user'],
      });
      if (game) await this.notifications.notifyCancelled(game, reason);
    } catch (error) {
      console.error(`Failed to notify about cancelled game ${gameId}:`, error);
    }
    return true;
  }

  /** planned -> completed, silently. */
  async complete(gameId: number): Promise<boolean> {
    const repo = this.db.getRepository(Game);
    const result = await repo.update({ id: gameId, status: GameStatus.PLANNED }, { status: GameStatus.COMPLETED });
    return !!result.affected;
  }

  async runAutoTransitions(now: Date = new Date()): Promise<{ cancelled: number[]; completed: number[] }> {
    const repo = this.db.getRepository(Game);

    const completeBefore = new Date(now.getTime() - AUTO_COMPLETE_AFTER_MS);
    const completedResult = await repo
      .createQueryBuilder()
      .update(Game)
      .set({ status: GameStatus.COMPLETED })
      .where('status = :planned AND game_date <= :completeBefore', { planned: GameStatus.PLANNED, completeBefore })
      .returning('id')
      .execute();
    const completed = ((completedResult.raw ?? []) as Array<{ id: number }>).map((row) => row.id);

    const candidates = await repo.find({
      where: {
        status: GameStatus.PLANNED,
        type: GameType.GAME,
        registration_lock_hours: Not(IsNull()),
        game_date: MoreThan(now),
      },
      relations: ['participants'],
    });

    const cancelled: number[] = [];
    for (const game of candidates) {
      try {
        if (shouldAutoCancel(game, now) && (await this.cancel(game.id, 'min_not_reached'))) {
          cancelled.push(game.id);
        }
      } catch (error) {
        console.error(`Auto-cancel failed for game ${game.id}:`, error);
      }
    }

    return { cancelled, completed };
  }
}
