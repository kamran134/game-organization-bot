import { Context, Markup } from 'telegraf';
import { LocationService } from '../../services/LocationService';
import { GroupService } from '../../services/GroupService';
import { UserService } from '../../services/UserService';
import { KeyboardBuilder } from '../ui/KeyboardBuilder';
import { escapeMarkdownV1, escapeMarkdownUrl } from '../../utils/helpers';

interface ListLocationsCommandServices {
  locationService: LocationService;
  groupService: GroupService;
  userService: UserService;
}

export class ListLocationsCommand {
  protected services: ListLocationsCommandServices;

  constructor(services: ListLocationsCommandServices) {
    this.services = services;
  }

  get command(): string {
    return 'locations';
  }

  get description(): string {
    return 'Показать все локации группы';
  }

  get isGroupOnly(): boolean {
    return true;
  }

  get isPrivateOnly(): boolean {
    return false;
  }

  async execute(ctx: Context): Promise<void> {
    // Проверяем что команда вызвана в группе
    if (!ctx.chat || ctx.chat.type === 'private') {
      await ctx.reply('❌ Эта команда доступна только в групповых чатах.');
      return;
    }

    // Получаем группу
    const group = await this.services.groupService.getGroupByChatId(ctx.chat.id);
    if (!group) {
      await ctx.reply('❌ Группа не найдена в базе данных. Сначала используйте /register для регистрации группы.');
      return;
    }

    // Получаем все локации группы
    const locations = await this.services.locationService.getByGroup(group.id);

    if (locations.length === 0) {
      await ctx.reply(
        '📍 У группы пока нет локаций.\n\n' +
        'Администраторы могут добавить локацию командой /addlocation'
      );
      return;
    }

    // Группируем локации по видам спорта
    const locationsBySport = new Map<string, typeof locations>();
    locations.forEach(location => {
      // Получаем все виды спорта для этой локации
      location.sportLocations?.forEach(sl => {
        const sportKey = `${sl.sport.emoji} ${sl.sport.name}`;
        if (!locationsBySport.has(sportKey)) {
          locationsBySport.set(sportKey, []);
        }
        // Добавляем только если ещё не добавлена
        if (!locationsBySport.get(sportKey)!.some(l => l.id === location.id)) {
          locationsBySport.get(sportKey)!.push(location);
        }
      });
    });

    // Формируем сообщение
    let message = `📍 Локации группы "${escapeMarkdownV1(group.name)}"\n\n`;

    for (const [sportName, sportLocations] of locationsBySport) {
      message += `${escapeMarkdownV1(sportName)}:\n`;
      sportLocations.forEach(location => {
        message += `  • ${escapeMarkdownV1(location.name)}`;
        if (location.map_url) {
          message += ` - [карта](${escapeMarkdownUrl(location.map_url)})`;
        }
        message += '\n';
      });
      message += '\n';
    }

    // Проверяем является ли пользователь админом
    let isAdmin = false;
    if (ctx.from) {
      const user = await this.services.userService.getUserByTelegramId(ctx.from.id);
      if (user) {
        isAdmin = await this.services.groupService.isUserAdmin(user.id, group.id);
      }
    }

    const keyboard = isAdmin 
      ? Markup.inlineKeyboard([[Markup.button.callback('⚙️ Управление локациями', `manage_locations_${group.id}`)]])
      : undefined;

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      link_preview_options: { is_disabled: true },
      ...(keyboard && { reply_markup: keyboard.reply_markup })
    });
  }
}
