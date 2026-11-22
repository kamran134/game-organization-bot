import { Context } from 'telegraf';
import { Markup } from 'telegraf';
import { CommandHandler, CommandServices } from './base/CommandHandler';
import { webAppLink } from '../ui/webAppLink';
import { formatMafiaCard } from '../ui/MafiaMessageBuilder';
import { MafiaService } from '../../services/MafiaService';
import { MafiaStatus } from '../../models/MafiaEvent';

export interface MafiaCommandServices extends CommandServices {
  mafiaService: MafiaService;
}

/** Re-posts the announcement card of every active Mafia evening of the group, plus a link to the full list. */
export class MafiaCommand extends CommandHandler {
  private readonly mafiaService: MafiaService;

  constructor(services: MafiaCommandServices) {
    super(services);
    this.mafiaService = services.mafiaService;
  }

  get command(): string {
    return 'mafia';
  }

  get description(): string {
    return 'Мафия группы';
  }

  async execute(ctx: Context): Promise<void> {
    if (!(await this.isGroupOnly(ctx))) return;

    const group = await this.services.groupService.getGroupByChatId(ctx.chat!.id);
    if (!group) {
      await ctx.reply('❌ Группа не найдена. Используйте /register для регистрации.');
      return;
    }

    // Url button: web_app buttons do not work in group chats
    const listButton = Markup.inlineKeyboard([[Markup.button.url('🎭 Все вечера', webAppLink(`mafias_${group.id}`))]]);

    // The per-user "joined" flag is not shown in the group card, so no user id is needed
    const events = (await this.mafiaService.listGroupEvents(group.id, 0))
      .map((item) => item.event)
      .filter((event) => event.status !== MafiaStatus.FINISHED);

    if (events.length === 0) {
      await ctx.reply('🎭 Активных вечеров мафии нет. Любой участник может создать его в приложении.', listButton);
      return;
    }

    for (const event of events) {
      const participants = await this.mafiaService.getParticipants(event.id);
      const { text, reply_markup } = formatMafiaCard(event, participants.map((p) => p.user));
      const message = await ctx.reply(text, { parse_mode: 'HTML', reply_markup });
      // The newest card is the one that stays live
      await this.mafiaService.setCardMessage(event.id, ctx.chat!.id, message.message_id);
    }
    await ctx.reply('🎭 Все вечера мафии — в приложении:', listButton);
  }
}
