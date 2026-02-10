import { Telegraf } from 'telegraf';
import { ActionHandler, ActionServices } from './base/ActionHandler';
import { KeyboardBuilder } from '../ui/KeyboardBuilder';
import { GameMessageBuilder } from '../ui/GameMessageBuilder';

export class GameCreationActionsHandler extends ActionHandler {
  constructor(services: ActionServices) {
    super(services);
  }

  register(bot: Telegraf): void {
    // Sport selection for game creation
    bot.action(/^sport_(\d+)$/, async (ctx) => {
      const sportId = parseInt(ctx.match[1]);
      const userId = ctx.from!.id;
      const state = this.services.gameCreationStates.get(userId);

      if (!state) {
        await ctx.answerCbQuery('Сессия истекла. Начните заново: /newgame');
        return;
      }

      // Получаем sport из БД
      const sport = await this.services.sportService.getSportById(sportId);
      if (!sport) {
        await ctx.answerCbQuery('❌ Ошибка: вид спорта не найден');
        return;
      }

      state.data.sportId = sport.id;
      state.data.sportName = `${sport.emoji} ${sport.name}`;
      state.step = 'date';
      this.services.gameCreationStates.set(userId, state);

      await ctx.editMessageText(
        `✅ Выбран: ${state.data.sportName}\n\n` +
        '🚀 БЫСТРЫЙ СПОСОБ (одной строкой через /):\n' +
        '📝 дата время / мин-макс / стоимость / заметки / локация\n\n' +
        'Пример:\n' +
        '10.02 18:00 / 5-10 / 500 / Приходите за 15 минут / Спортзал Олимп\n' +
        'Или короче: 10.02 18:00 / 10 / 0 / - / Зал\n\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
        '📋 ПОШАГОВЫЙ СПОСОБ:\n' +
        '📅 Введите дату и время игры\n' +
        '⚠️ ВАЖНО: Ответьте (reply) на это сообщение!\n\n' +
        'Формат: ДД.ММ.ГГГГ ЧЧ:ММ\n' +
        'Примеры: 15.02.2026 19:00 или 15.02 19:00'
      );
      await ctx.answerCbQuery();
    });

    // Confirm game creation
    bot.action(/^confirm_game_(\d+)$/, async (ctx) => {
      const userId = parseInt(ctx.match[1]);
      const state = this.services.gameCreationStates.get(userId);

      if (!state) {
        await ctx.answerCbQuery('Сессия истекла');
        return;
      }

      try {
        const game = await this.services.gameService.createGame({
          groupId: state.groupId,
          creatorId: state.userId,
          sportId: state.data.sportId!,
          gameDate: state.data.gameDate!,
          locationId: state.data.locationId!,
          maxParticipants: state.data.maxParticipants!,
          minParticipants: state.data.minParticipants!,
          cost: state.data.cost,
          notes: state.data.notes,
        });

        this.services.gameCreationStates.delete(userId);

        // Проверяем isAdmin (создатель скорее всего админ)
        const user = await this.services.userService.getUserByTelegramId(userId);
        const isAdmin = user ? await this.services.groupService.isUserAdmin(user.id, state.groupId) : false;

        const createdMessage = GameMessageBuilder.formatGameCreatedMessage(game);
        await ctx.editMessageText(
          createdMessage + '\n\nУчастники могут записаться прямо здесь:',
          KeyboardBuilder.createGameActionsKeyboard(game.id, 0, isAdmin)
        );
        await ctx.answerCbQuery('✅ Игра создана!');
      } catch (error) {
        console.error('Error creating game:', error);
        await ctx.answerCbQuery('❌ Ошибка создания игры');
        this.services.gameCreationStates.delete(userId);
      }
    });

    // Location selection
    bot.action(/^location_(\d+)$/, async (ctx) => {
      const locationId = parseInt(ctx.match[1]);
      const userId = ctx.from!.id;
      const state = this.services.gameCreationStates.get(userId);

      if (!state || state.step !== 'location') {
        await ctx.answerCbQuery('Сессия истекла. Начните заново: /newgame');
        return;
      }

      const location = await this.services.locationService.getById(locationId);
      if (!location) {
        await ctx.answerCbQuery('❌ Локация не найдена');
        return;
      }

      state.data.locationId = location.id;
      state.data.locationName = location.name;
      this.services.gameCreationStates.set(userId, state);

      // Показываем подтверждение создания игры
      const confirmationMessage = GameMessageBuilder.formatGameConfirmation(state);
      await ctx.editMessageText(
        confirmationMessage,
        KeyboardBuilder.createGameConfirmationKeyboard(userId)
      );
      await ctx.answerCbQuery();
    });

    // Custom location (text input)
    bot.action('location_custom', async (ctx) => {
      const userId = ctx.from!.id;
      const state = this.services.gameCreationStates.get(userId);

      if (!state || state.step !== 'location') {
        await ctx.answerCbQuery('Сессия истекла. Начните заново: /newgame');
        return;
      }

      await ctx.editMessageText(
        '📍 Введите название места:\n' +
        '⚠️ Ответьте (reply) на это сообщение!\n\n' +
        'Например: "Стадион Центральный" или "ул. Ленина, 15"'
      );
      await ctx.answerCbQuery();
    });

    // Cancel game creation
    bot.action(/^cancel_game_(\d+)$/, async (ctx) => {
      const userId = parseInt(ctx.match[1]);
      this.services.gameCreationStates.delete(userId);

      await ctx.editMessageText('❌ Создание игры отменено.');
      await ctx.answerCbQuery('Отменено');
    });
  }
}
