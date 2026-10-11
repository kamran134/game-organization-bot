import { Context, Markup } from 'telegraf';
import { CommandHandler, CommandServices } from './base/CommandHandler';
import { PaymentService } from '../../services/PaymentService';
import { currentMonth } from '../../utils/helpers';
import { GameType } from '../../models/GameType';
import { formatDate } from '../ui/formatters';
import { Game } from '../../models/Game';

export interface PaymentsCommandServices extends CommandServices {
  paymentService: PaymentService;
}

export class PaymentsCommand extends CommandHandler {
  private paymentService: PaymentService;

  constructor(services: PaymentsCommandServices) {
    super(services);
    this.paymentService = services.paymentService;
  }

  get command(): string {
    return 'payments';
  }

  async execute(ctx: Context): Promise<void> {
    if (!(await this.isGroupOnly(ctx))) return;

    const chatId = ctx.chat!.id;
    const group = await this.services.groupService.getGroupByChatId(chatId);

    if (!group) {
      await ctx.reply('❌ Группа не найдена.');
      return;
    }

    const games = await this.services.gameService.getUpcomingGroupGames(group.id);

    if (games.length === 0) {
      await ctx.reply('📭 Нет запланированных игр.');
      return;
    }

    if (games.length === 1) {
      await this.showGamePayments(ctx, games[0]);
      return;
    }

    const buttons = games.map((g) => {
      const sport = g.sport ? `${g.sport.emoji} ${g.sport.name}` : 'Игра';
      const date = formatDate(g.game_date);
      const typeLabel = g.type === GameType.TRAINING ? '🏃' : '🎮';
      return [Markup.button.callback(
        `${typeLabel} ${sport} — ${date}`,
        `show_payments_${g.id}`,
      )];
    });

    await ctx.reply(
      '💰 Выберите игру для просмотра оплат:',
      Markup.inlineKeyboard(buttons),
    );
  }

  async showGamePaymentsById(ctx: Context, gameId: number): Promise<void> {
    const game = await this.services.gameService.getGameById(gameId);
    if (!game) {
      await ctx.reply('❌ Игра не найдена.');
      return;
    }
    await this.showGamePayments(ctx, game);
  }

  private async showGamePayments(ctx: Context, game: Game): Promise<void> {
    const sport = game.sport ? `${game.sport.emoji} ${game.sport.name}` : 'Игра';
    const date = formatDate(game.game_date);

    let payers: string[] = [];
    let total = 0;

    if (game.type === GameType.TRAINING) {
      const month = currentMonth();
      const rows = await this.paymentService.getTrainingPaid(game.group_id, month);
      payers = rows.map(r =>
        [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Участник',
      );
      total = rows.reduce((sum, r) => sum + parseFloat(r.amount), 0);
    } else {
      const rows = await this.paymentService.getGamePaid(game.id);
      payers = rows.map(r =>
        r.guest_name ?? ([r.first_name, r.last_name].filter(Boolean).join(' ') || 'Участник'),
      );
      total = rows.reduce((sum, r) => sum + parseFloat(r.amount), 0);
    }

    const typeLabel = game.type === GameType.TRAINING ? 'тренировку' : 'игру';
    const header = `💰 Оплаты за ${typeLabel} — ${sport} ${date}`;

    if (payers.length === 0) {
      await ctx.reply(`${header}\n\n💸 Оплат пока нет.`);
      return;
    }

    const list = payers.map(name => `• ${name}`).join('\n');
    await ctx.reply(`${header}\n\n✅ Оплатили (${payers.length}):\n${list}\n\n💵 Итого собрано: ${total.toFixed(2)}`);
  }
}
