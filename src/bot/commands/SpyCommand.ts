import { Context } from 'telegraf';
import { Markup } from 'telegraf';
import { CommandHandler, CommandServices } from './base/CommandHandler';
import { webAppLink } from '../ui/webAppLink';
import { formatSpyCard } from '../ui/SpyMessageBuilder';
import { SpyService } from '../../services/SpyService';
import { loadSpyCardRound } from '../../services/spyCard';
import { SpyStatus } from '../../models/SpyEvent';

export interface SpyCommandServices extends CommandServices {
  spyService: SpyService;
}

/** Re-posts the live card of every active Spy evening of the group, plus a link to the full list. */
export class SpyCommand extends CommandHandler {
  private readonly spyService: SpyService;

  constructor(services: SpyCommandServices) {
    super(services);
    this.spyService = services.spyService;
  }

  get command(): string {
    return 'spy';
  }

  get description(): string {
    return 'Шпион группы';
  }

  async execute(ctx: Context): Promise<void> {
    if (!(await this.isGroupOnly(ctx))) return;

    const group = await this.services.groupService.getGroupByChatId(ctx.chat!.id);
    if (!group) {
      await ctx.reply('❌ Группа не найдена. Используйте /register для регистрации.');
      return;
    }

    // Url button: web_app buttons do not work in group chats
    const listButton = Markup.inlineKeyboard([[Markup.button.url('🕵️ Все вечера', webAppLink(`spies_${group.id}`))]]);

    // The per-user "joined" flag is not shown in the group card, so no user id is needed
    const events = (await this.spyService.listGroupEvents(group.id, 0))
      .map((item) => item.event)
      .filter((event) => event.status !== SpyStatus.FINISHED);

    if (events.length === 0) {
      await ctx.reply('🕵️ Активных вечеров «Шпиона» нет. Любой участник может создать его в приложении.', listButton);
      return;
    }

    for (const event of events) {
      const participants = await this.spyService.getParticipants(event.id);
      const current = event.status === SpyStatus.IN_PROGRESS ? await loadSpyCardRound(this.spyService, event.id) : null;
      const { text, reply_markup } = formatSpyCard(event, participants.map((p) => p.user), current);
      const message = await ctx.reply(text, { parse_mode: 'HTML', reply_markup });
      // The newest card is the one that stays live
      await this.spyService.setCardMessage(event.id, ctx.chat!.id, message.message_id);
    }
    await ctx.reply('🕵️ Все вечера «Шпиона» — в приложении:', listButton);
  }
}
