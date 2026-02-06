import { Context } from 'telegraf';
import { LocationService } from '../../services/LocationService';
import { GroupService } from '../../services/GroupService';

interface ListLocationsCommandServices {
  locationService: LocationService;
  groupService: GroupService;
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
      const sportKey = `${location.sport.emoji} ${location.sport.name}`;
      if (!locationsBySport.has(sportKey)) {
        locationsBySport.set(sportKey, []);
      }
      locationsBySport.get(sportKey)!.push(location);
    });

    // Формируем сообщение
    let message = `📍 Локации группы "${group.name}"\n\n`;

    for (const [sportName, sportLocations] of locationsBySport) {
      message += `${sportName}:\n`;
      sportLocations.forEach(location => {
        message += `  • ${location.name}`;
        if (location.map_url) {
          message += ` - [карта](${location.map_url})`;
        }
        message += '\n';
      });
      message += '\n';
    }

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      link_preview_options: { is_disabled: true }
    });
  }
}
