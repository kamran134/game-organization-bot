import { Context, Telegraf } from 'telegraf';
import { ActionHandler, ActionServices } from './base/ActionHandler';
import { SpyService } from '../../services/SpyService';
import { refreshSpyCard } from '../../services/spyCard';
import { GroupRole } from '../../models/GroupMember';
import { SpyEvent } from '../../models/SpyEvent';
import { User } from '../../models/User';
import { ConflictError, ValidationError } from '../../utils/errors';
import { SPY_MIN_PLAYERS } from '../../utils/spyDeal';

export interface SpyActionsServices extends ActionServices {
  spyService: SpyService;
}

/** Callback-query answers for service rejections; anything unlisted falls back to the action's own default. */
const REJECTIONS: Record<string, string> = {
  'Already joined': 'Вы уже записаны',
  'Event is full': 'Мест нет',
  'Not joined': 'Вы не записаны',
  'Not enough players': `Нужно минимум ${SPY_MIN_PLAYERS} игрока`,
  'No locations to play': 'Нет локаций для игры: выберите пакеты в настройках вечера',
  'Round is not finished': 'Предыдущая партия ещё не окончена',
  'Round in progress': 'Партия уже идёт',
  'Not your turn': 'Сейчас не ваш ход',
  'Voter is not in the game': 'Вы не участвуете в этой партии',
  'Cannot vote for yourself': 'За себя голосовать нельзя',
  'Target is not in the game': 'Этот игрок выбыл из партии',
  'Vote for one of the leaders': 'Во втором туре голосуют только за лидеров',
  'Round finished': 'Партия уже окончена',
  'Wrong round state': 'Сейчас это действие недоступно',
  'Event finished': 'Вечер завершён',
};

/** Buttons of the live group card of a Spy evening. */
export class SpyActionsHandler extends ActionHandler {
  private readonly spyService: SpyService;

  constructor(services: SpyActionsServices) {
    super(services);
    this.spyService = services.spyService;
  }

  register(bot: Telegraf): void {
    // Every pattern is anchored, so "spy_voting_<id>" can never be taken for "spy_vote_<id>_<id>" and vice versa
    bot.action(/^spy_join_(\d+)$/, (ctx) => this.handleJoin(ctx, parseInt(ctx.match[1], 10)));
    bot.action(/^spy_leave_(\d+)$/, (ctx) => this.handleLeave(ctx, parseInt(ctx.match[1], 10)));
    bot.action(/^spy_close_(\d+)$/, (ctx) => this.handleClose(ctx, parseInt(ctx.match[1], 10)));
    bot.action(/^spy_start_(\d+)$/, (ctx) => this.handleStart(ctx, parseInt(ctx.match[1], 10)));
    bot.action(/^spy_next_(\d+)$/, (ctx) => this.handleNext(ctx, parseInt(ctx.match[1], 10)));
    bot.action(/^spy_voting_(\d+)$/, (ctx) => this.handleOpenVoting(ctx, parseInt(ctx.match[1], 10)));
    bot.action(/^spy_vote_(\d+)_(\d+)$/, (ctx) => this.handleVote(ctx, parseInt(ctx.match[1], 10), parseInt(ctx.match[2], 10)));
  }

  async handleJoin(ctx: Context, eventId: number): Promise<void> {
    if (!ctx.from) {
      await ctx.answerCbQuery('❌ Ошибка');
      return;
    }
    const event = await this.spyService.getEvent(eventId);
    if (!event) {
      await ctx.answerCbQuery('❌ Вечер не найден');
      return;
    }

    // Same path as joining a game from its card: register the user and add them to the group on the fly
    const user = await this.services.userService.findOrCreateUser({
      id: ctx.from.id,
      username: ctx.from.username,
      first_name: ctx.from.first_name,
      last_name: ctx.from.last_name,
    });
    if (!(await this.services.groupService.isUserMember(user.id, event.group_id))) {
      await this.services.groupService.addMemberToGroup(user.id, event.group_id, GroupRole.MEMBER);
    }

    if (!(await this.run(ctx, 'Запись закрыта', () => this.spyService.join(eventId, user.id)))) return;
    await ctx.answerCbQuery('✅ Вы записаны');
    await this.refresh(eventId);
  }

  async handleLeave(ctx: Context, eventId: number): Promise<void> {
    const user = await this.currentUser(ctx);
    if (!user) {
      await ctx.answerCbQuery('❌ Вы не записаны');
      return;
    }

    if (!(await this.run(ctx, 'Запись закрыта', () => this.spyService.leave(eventId, user.id)))) return;
    await ctx.answerCbQuery('Вы вышли');
    await this.refresh(eventId);
  }

  async handleClose(ctx: Context, eventId: number): Promise<void> {
    const event = await this.requireManager(ctx, eventId, 'Только организатор или админ может закрыть набор');
    if (!event) return;

    if (!(await this.run(ctx, 'Набор уже закрыт', () => this.spyService.closeRegistration(eventId)))) return;
    await ctx.answerCbQuery('🔒 Набор закрыт');
    await this.refresh(eventId);
  }

  async handleStart(ctx: Context, eventId: number): Promise<void> {
    const event = await this.requireManager(ctx, eventId, 'Только организатор или админ может начать партию');
    if (!event) return;

    let started: Awaited<ReturnType<SpyService['startRound']>> | undefined;
    if (!(await this.run(ctx, 'Не удалось начать партию', async () => { started = await this.spyService.startRound(eventId); }))) return;
    await ctx.answerCbQuery('🎬 Партия началась');

    // startRound returns bare players; the DMs need their users (and the turn pings the first speaker)
    const participants = await this.spyService.getParticipants(eventId);
    const userOf = new Map(participants.map((p) => [p.user_id, p.user]));
    const players = started!.players.flatMap((p) => {
      const user = userOf.get(p.user_id);
      return user ? [{ user, role: p.role }] : [];
    });
    await this.services.notificationService.notifySpyRoundStarted(event, started!.round, players);
    await this.refresh(eventId);
  }

  async handleNext(ctx: Context, eventId: number): Promise<void> {
    const user = await this.currentUser(ctx);
    const event = await this.spyService.getEvent(eventId);
    if (!user || !event) {
      await ctx.answerCbQuery('❌ Вечер не найден');
      return;
    }

    // The current player passes on their own turn; a manager may pass any turn
    const force = await this.isManager(event, user);
    let turn: Awaited<ReturnType<SpyService['nextTurn']>> | undefined;
    if (!(await this.run(ctx, 'Ход сейчас передать нельзя', async () => { turn = await this.spyService.nextTurn(eventId, user.id, { force }); }))) return;
    await ctx.answerCbQuery('🗣 Ход передан');

    const participants = await this.spyService.getParticipants(eventId);
    const next = participants.find((p) => p.user_id === turn!.currentUserId)?.user;
    if (next) await this.services.notificationService.notifySpyTurn(event, next, turn!.cycle, turn!.deadline);
    await this.refresh(eventId);
  }

  async handleOpenVoting(ctx: Context, eventId: number): Promise<void> {
    const event = await this.requireManager(ctx, eventId, 'Только организатор или админ может открыть голосование');
    if (!event) return;

    if (!(await this.run(ctx, 'Голосование сейчас открыть нельзя', () => this.spyService.openVoting(eventId)))) return;
    await ctx.answerCbQuery('🗳 Голосование открыто');
    await this.refresh(eventId);
  }

  async handleVote(ctx: Context, eventId: number, targetId: number): Promise<void> {
    const user = await this.currentUser(ctx);
    const event = await this.spyService.getEvent(eventId);
    if (!user || !event) {
      await ctx.answerCbQuery('❌ Вечер не найден');
      return;
    }

    let outcome: Awaited<ReturnType<SpyService['castVote']>> | undefined;
    if (!(await this.run(ctx, 'Голосование сейчас закрыто', async () => { outcome = await this.spyService.castVote(eventId, user.id, targetId); }))) return;

    const result = outcome!;
    switch (result.state) {
      case 'pending':
        await ctx.answerCbQuery('🗳 Голос принят');
        break;
      case 'tie': {
        await ctx.answerCbQuery('🗳 Ничья — второй тур');
        const participants = await this.spyService.getParticipants(eventId);
        const leaders = participants.filter((p) => result.leaders.includes(p.user_id)).map((p) => p.user);
        await this.services.notificationService.notifySpyVoteTie(event, leaders, result.nextBallot);
        break;
      }
      case 'resolved': {
        await ctx.answerCbQuery('🎬 Голосование завершено');
        await this.services.notificationService.notifySpyRoundFinished(event, { round: result.round, players: result.players });
        break;
      }
    }
    await this.refresh(eventId);
  }

  /**
   * Runs a service call and turns its ConflictError / ValidationError into an alert for the user.
   * Returns false when the call was rejected; any other error propagates.
   */
  private async run(ctx: Context, fallback: string, call: () => Promise<unknown>): Promise<boolean> {
    try {
      await call();
      return true;
    } catch (error) {
      if (!(error instanceof ConflictError) && !(error instanceof ValidationError)) throw error;
      await ctx.answerCbQuery(REJECTIONS[error.message] ?? fallback, { show_alert: true });
      return false;
    }
  }

  private async refresh(eventId: number): Promise<void> {
    await refreshSpyCard(this.spyService, this.services.notificationService, eventId);
  }

  private async currentUser(ctx: Context): Promise<User | null> {
    return ctx.from ? this.services.userService.getUserByTelegramId(ctx.from.id) : null;
  }

  /** The organizer or a group admin. */
  private async isManager(event: SpyEvent, user: User): Promise<boolean> {
    return event.host_id === user.id || (await this.services.groupService.isUserAdmin(user.id, event.group_id));
  }

  /** The event when the caller manages it; otherwise answers the callback and returns null. */
  private async requireManager(ctx: Context, eventId: number, denial: string): Promise<SpyEvent | null> {
    const event = await this.spyService.getEvent(eventId);
    if (!event) {
      await ctx.answerCbQuery('❌ Вечер не найден');
      return null;
    }
    const user = await this.currentUser(ctx);
    if (!user || !(await this.isManager(event, user))) {
      await ctx.answerCbQuery(denial, { show_alert: true });
      return null;
    }
    return event;
  }
}
