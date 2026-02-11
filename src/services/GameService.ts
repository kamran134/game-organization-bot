import { Database } from '../database/Database';
import { Game, GameStatus } from '../models/Game';
import { GameType } from '../models/GameType';
import { GameParticipant, ParticipationStatus } from '../models/GameParticipant';
import { MoreThanOrEqual } from 'typeorm';

export interface CreateGameData {
  group_id: number;
  creator_id: number;
  sport_id: number;
  game_date: Date;
  location_id: number;
  min_participants: number;
  max_participants: number;
  cost?: number;
  notes?: string;
  type?: GameType; // Опционально, по умолчанию GAME
}

export class GameService {
  private db: Database;

  constructor(database: Database) {
    this.db = database;
  }

  async createGame(data: CreateGameData): Promise<Game> {
    const gameRepo = this.db.getRepository(Game);

    const game = gameRepo.create({
      group_id: data.group_id,
      creator_id: data.creator_id,
      sport_id: data.sport_id,
      game_date: data.game_date,
      location_id: data.location_id,
      min_participants: data.min_participants,
      max_participants: data.max_participants,
      cost: data.cost,
      notes: data.notes,
      status: GameStatus.PLANNED,
      type: data.type || GameType.GAME, // По умолчанию GAME
    });

    await gameRepo.save(game);
    console.log(`${data.type === GameType.TRAINING ? 'Training' : 'Game'} created: ID ${game.id} on ${game.game_date}`);
    return game;
  }

  async getGameById(gameId: number): Promise<Game | null> {
    const gameRepo = this.db.getRepository(Game);
    return gameRepo.findOne({
      where: { id: gameId },
      relations: ['group', 'creator', 'sport', 'location', 'participants', 'participants.user'],
    });
  }

  async getUpcomingGroupGames(groupId: number): Promise<Game[]> {
    const gameRepo = this.db.getRepository(Game);
    return gameRepo.find({
      where: {
        group_id: groupId,
        status: GameStatus.PLANNED,
        game_date: MoreThanOrEqual(new Date()),
      },
      relations: ['sport', 'location', 'participants', 'participants.user'],
      order: { game_date: 'ASC' },
    });
  }

  async addParticipant(
    gameId: number,
    userId: number,
    status: ParticipationStatus,
    guestName?: string
  ): Promise<void> {
    const participantRepo = this.db.getRepository(GameParticipant);

    try {
      const existing = await participantRepo.findOne({
        where: { game_id: gameId, user_id: userId },
      });

      if (existing) {
        // Update existing participation
        existing.participation_status = status;
        existing.updated_at = new Date();
        if (guestName) existing.guest_name = guestName;
        await participantRepo.save(existing);
      } else {
        // Create new participation
        const participant = participantRepo.create({
          game_id: gameId,
          user_id: userId,
          participation_status: status,
          guest_name: guestName,
        });
        await participantRepo.save(participant);
      }
    } catch (error: any) {
      // Handle race condition: если между findOne и save другой запрос успел создать запись
      if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('unique')) {
        // Повторяем попытку - теперь найдем существующую запись и обновим
        const existing = await participantRepo.findOne({
          where: { game_id: gameId, user_id: userId },
        });
        if (existing) {
          existing.participation_status = status;
          existing.updated_at = new Date();
          if (guestName) existing.guest_name = guestName;
          await participantRepo.save(existing);
        }
      } else {
        throw error; // Пробрасываем другие ошибки
      }
    }

    // Recalculate positions
    await this.updateParticipantPositions(gameId);
  }

  async removeParticipant(gameId: number, userId: number): Promise<void> {
    const participantRepo = this.db.getRepository(GameParticipant);
    await participantRepo.delete({ game_id: gameId, user_id: userId });
    await this.updateParticipantPositions(gameId);
  }

  async updateParticipantPositions(gameId: number): Promise<void> {
    const participantRepo = this.db.getRepository(GameParticipant);
    const participants = await participantRepo.find({
      where: { game_id: gameId },
      relations: ['user'],
      order: { joined_at: 'ASC' },
    });

    // Sort by priority: confirmed -> maybe -> guest
    participants.sort((a, b) => {
      const priorityDiff = a.getPriority() - b.getPriority();
      if (priorityDiff !== 0) return priorityDiff;
      return a.joined_at.getTime() - b.joined_at.getTime();
    });

    // Update positions
    for (let i = 0; i < participants.length; i++) {
      participants[i].position = i + 1;
      await participantRepo.save(participants[i]);
    }
  }

  async getParticipantsByStatus(gameId: number): Promise<{
    confirmed: GameParticipant[];
    maybe: GameParticipant[];
    guests: GameParticipant[];
    waiting: GameParticipant[];
  }> {
    const game = await this.getGameById(gameId);
    if (!game) {
      return { confirmed: [], maybe: [], guests: [], waiting: [] };
    }

    const participants = game.participants.sort((a, b) => (a.position || 0) - (b.position || 0));

    const confirmed = participants.filter((p) => p.participation_status === ParticipationStatus.CONFIRMED);
    const maybe = participants.filter((p) => p.participation_status === ParticipationStatus.MAYBE);
    const guests = participants.filter((p) => p.participation_status === ParticipationStatus.GUEST);

    // Those with position > max_participants are in waiting list
    const waiting = participants.filter((p) => (p.position || 0) > game.max_participants);

    return { confirmed, maybe, guests, waiting };
  }

  async cancelGame(gameId: number): Promise<void> {
    const gameRepo = this.db.getRepository(Game);
    await gameRepo.update(gameId, { status: GameStatus.CANCELLED });
  }

  async completeGame(gameId: number): Promise<void> {
    const gameRepo = this.db.getRepository(Game);
    await gameRepo.update(gameId, { status: GameStatus.COMPLETED });
  }
}
