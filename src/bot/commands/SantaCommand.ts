import { Context } from 'telegraf';
import { Markup } from 'telegraf';
import { CommandHandler, CommandServices } from './base/CommandHandler';
import { webAppLink } from '../ui/webAppLink';
import { formatSantaCard } from '../ui/SantaMessageBuilder';
import { SantaService } from '../../services/SantaService';
import { SantaStatus } from '../../models/SantaEvent';

export interface SantaCommandServices extends CommandServices {
  santaService: SantaService;
}

/** Re-posts the announcement card of every active Secret Santa event of the group. */
export class SantaCommand extends CommandHandler {
  private readonly santaService: SantaService;

  constructor(services: SantaCommandServices) {
    super(services);
    this.santaService = services.santaService;
  }

  get command(): string {
    return 'santa';
  }

  get description(): string {
    return 'Тайный Санта группы';
  }

  async execute(ctx: Context): Promise<void> {
    if (!(await this.isGroupOnly(ctx))) return;

    const group = await this.services.groupService.getGroupByChatId(ctx.chat!.id);
    if (!group) {
      await ctx.reply('❌ Группа не найдена. Используйте /register для регистрации.');
      return;
    }

    // The per-user "joined" flag is not shown in the group card, so no user id is needed
    const events = (await this.santaService.listGroupEvents(group.id, 0))
      .map((item) => item.event)
      .filter((event) => event.status !== SantaStatus.FINISHED);

    if (events.length === 0) {
      // Url button: web_app buttons do not work in group chats
      await ctx.reply(
        '🎅 Активных событий Тайного Санты нет. Администратор может создать его в приложении.',
        Markup.inlineKeyboard([[Markup.button.url('🎅 Открыть', webAppLink(`santas_${group.id}`))]]),
      );
      return;
    }

    for (const event of events) {
      const participants = await this.santaService.getParticipants(event.id);
      const { text, reply_markup } = formatSantaCard(event, participants.map((p) => p.user));
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup });
    }
  }
}
