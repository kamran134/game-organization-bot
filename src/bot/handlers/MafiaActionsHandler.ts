import { Context, Telegraf } from 'telegraf';
import { ActionHandler, ActionServices } from './base/ActionHandler';
import { MafiaService } from '../../services/MafiaService';
import { refreshMafiaCard } from '../../services/mafiaCard';
import { GroupRole } from '../../models/GroupMember';
import { ConflictError } from '../../utils/errors';
import { MAFIA_MIN_PLAYERS } from '../../utils/mafiaDeal';

export interface MafiaActionsServices extends ActionServices {
  mafiaService: MafiaService;
}

/** Callback-query answers for service rejections; anything unlisted means the signup is over. */
const JOIN_REJECTIONS: Record<string, string> = {
  'Host cannot play': 'Ведущий не играет',
  'Already joined': 'Вы уже записаны',
  'Event is full': 'Мест нет',
};

/** Join / leave / close-registration buttons of the live group card of a Mafia evening. */
export class MafiaActionsHandler extends ActionHandler {
  private readonly mafiaService: MafiaService;

  constructor(services: MafiaActionsServices) {
    super(services);
    this.mafiaService = services.mafiaService;
  }

  register(bot: Telegraf): void {
    bot.action(/^mafia_join_(\d+)$/, (ctx) => this.handleJoin(ctx, parseInt(ctx.match[1], 10)));
    bot.action(/^mafia_leave_(\d+)$/, (ctx) => this.handleLeave(ctx, parseInt(ctx.match[1], 10)));
    bot.action(/^mafia_close_(\d+)$/, (ctx) => this.handleClose(ctx, parseInt(ctx.match[1], 10)));
  }

  async handleJoin(ctx: Context, eventId: number): Promise<void> {
    if (!ctx.from) {
      await ctx.answerCbQuery('❌ Ошибка');
      return;
    }
    const event = await this.mafiaService.getEvent(eventId);
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

    try {
      await this.mafiaService.join(eventId, user.id);
    } catch (error) {
      if (!(error instanceof ConflictError)) throw error;
      await ctx.answerCbQuery(JOIN_REJECTIONS[error.message] ?? 'Запись закрыта', { show_alert: true });
      return;
    }
    await ctx.answerCbQuery('✅ Вы записаны');
    await refreshMafiaCard(this.mafiaService, this.services.notificationService, eventId);
  }

  async handleLeave(ctx: Context, eventId: number): Promise<void> {
    const user = ctx.from ? await this.services.userService.getUserByTelegramId(ctx.from.id) : null;
    if (!user) {
      await ctx.answerCbQuery('❌ Вы не записаны');
      return;
    }

    try {
      await this.mafiaService.leave(eventId, user.id);
    } catch (error) {
      if (!(error instanceof ConflictError)) throw error;
      await ctx.answerCbQuery(error.message === 'Not joined' ? 'Вы не записаны' : 'Запись закрыта', { show_alert: true });
      return;
    }
    await ctx.answerCbQuery('Вы вышли');
    await refreshMafiaCard(this.mafiaService, this.services.notificationService, eventId);
  }

  async handleClose(ctx: Context, eventId: number): Promise<void> {
    const event = await this.mafiaService.getEvent(eventId);
    if (!event) {
      await ctx.answerCbQuery('❌ Вечер не найден');
      return;
    }

    const user = ctx.from ? await this.services.userService.getUserByTelegramId(ctx.from.id) : null;
    const allowed = !!user && (event.host_id === user.id || (await this.services.groupService.isUserAdmin(user.id, event.group_id)));
    if (!allowed) {
      await ctx.answerCbQuery('Только ведущий или админ может закрыть запись', { show_alert: true });
      return;
    }

    try {
      await this.mafiaService.closeRegistration(eventId);
    } catch (error) {
      if (!(error instanceof ConflictError)) throw error;
      const text = error.message === 'Not enough players' ? `Нужно минимум ${MAFIA_MIN_PLAYERS} игрока` : 'Запись закрыта';
      await ctx.answerCbQuery(text, { show_alert: true });
      return;
    }
    await ctx.answerCbQuery('🔒 Запись закрыта');
    await refreshMafiaCard(this.mafiaService, this.services.notificationService, eventId);
  }
}
