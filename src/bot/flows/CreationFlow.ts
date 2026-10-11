import { Context } from 'telegraf';
import { Game } from '../../models/Game';
import { GameType } from '../../models/GameType';
import { GameService } from '../../services/GameService';
import { GroupService } from '../../services/GroupService';
import { LocationService } from '../../services/LocationService';
import { NotificationService } from '../../services/NotificationService';
import { SportService } from '../../services/SportService';
import { UserService } from '../../services/UserService';
import { CreationState, CreationStateManager } from '../../utils/CreationState';
import { StateManager } from '../../utils/StateManager';
import { KeyboardBuilder } from '../ui/KeyboardBuilder';
import { AskStep, CREATION_CONFIGS, CreationConfig, UNLIMITED_PARTICIPANTS } from './creationConfig';
import { GameCreationValidator } from './GameCreationValidator';

export interface CreationServices {
  gameService: GameService;
  groupService: GroupService;
  userService: UserService;
  sportService: SportService;
  locationService: LocationService;
  notificationService: NotificationService;
  creationStates: CreationStateManager;
}

type InlineKeyboard = ReturnType<typeof KeyboardBuilder.createGameConfirmationKeyboard>;
/** Posts a message: a new reply after a text input, an edit of the keyboard message after a button press. */
type Send = (text: string, keyboard?: InlineKeyboard) => Promise<unknown>;

const NO_LOCATIONS_PROMPT =
  '⚠️ Локаций для этого вида спорта в группе пока нет.\n' +
  '📍 Введите место проведения текстом:\n' +
  '⚠️ Ответьте (reply) на это сообщение!\n\n' +
  'Например: "Стадион Центральный" или "ул. Ленина, 15"\n\n' +
  'Администраторы могут добавить постоянную локацию командой /addlocation';

const SESSION_EXPIRED = '❌ Сессия создания истекла';

/** One wizard for creating games and trainings; what differs between them lives in creationConfig. */
export class CreationFlow {
  constructor(private readonly services: CreationServices) {}

  async start(ctx: Context, type: GameType, groupId: number, userId: number): Promise<void> {
    const sports = await this.services.sportService.getSportsForGroup(groupId);
    if (sports.length === 0) {
      await ctx.reply('❌ В системе нет доступных видов спорта.');
      return;
    }

    // One wizard per user: a stale wizard of any kind must not keep eating text input
    StateManager.clearUser(ctx.from!.id);
    this.services.creationStates.set(ctx.from!.id, { type, step: 'sport', groupId, userId, data: {} });

    await ctx.reply(
      `${CREATION_CONFIGS[type].startTitle}\n\nВыберите вид спорта:`,
      KeyboardBuilder.createSportSelectionKeyboard(sports)
    );
  }

  async selectSport(ctx: Context, state: CreationState, sportId: number): Promise<void> {
    const config = CREATION_CONFIGS[state.type];
    const sport = await this.services.sportService.getSportById(sportId);
    if (!sport) {
      await ctx.answerCbQuery('❌ Вид спорта не найден');
      return;
    }

    state.data.sportId = sport.id;
    state.data.sportName = config.sportLabel(sport);
    state.step = 'date';
    this.services.creationStates.set(ctx.from!.id, state);

    await ctx.editMessageText(config.sportChosen(sport));
    await ctx.answerCbQuery();
  }

  async selectLocation(ctx: Context, state: CreationState, locationId: number): Promise<void> {
    const config = CREATION_CONFIGS[state.type];
    const location = await this.services.locationService.getById(locationId);
    if (!location) {
      await ctx.answerCbQuery('❌ Локация не найдена');
      return;
    }

    state.data.locationId = location.id;
    state.data.locationName = location.name;
    state.data.locationMapUrl = undefined;

    await this.advance(ctx, state, this.editSender(ctx), config.locationChosen?.(location.name));
    await ctx.answerCbQuery();
  }

  async requestCustomLocation(ctx: Context, state: CreationState): Promise<void> {
    await ctx.editMessageText(CREATION_CONFIGS[state.type].customLocationPrompt);
    await ctx.answerCbQuery();
  }

  async handleTextInput(ctx: Context, userId: number, text: string): Promise<void> {
    const state = this.services.creationStates.get(userId);
    if (!state) return;

    if (state.step === 'date' && text.includes(' / ')) {
      await this.handleQuickInput(ctx, state, text);
      return;
    }

    switch (state.step) {
      case 'date':
        return this.handleDate(ctx, state, text);
      case 'location':
        return this.handleLocation(ctx, state, text);
      case 'min_participants':
        return this.handleMinParticipants(ctx, state, text);
      case 'max_participants':
        return this.handleMaxParticipants(ctx, state, text);
      case 'cost':
        return this.handleCost(ctx, state, text);
      case 'notes':
        return this.handleNotes(ctx, state, text);
      default:
        return;
    }
  }

  async confirm(ctx: Context, type: GameType, ownerTelegramId: number): Promise<void> {
    const config = CREATION_CONFIGS[type];
    if (ctx.from!.id !== ownerTelegramId) {
      await ctx.answerCbQuery(config.notYours);
      return;
    }

    const state = this.services.creationStates.get(ownerTelegramId);
    if (!state || state.type !== type || state.step !== 'confirm') {
      await ctx.answerCbQuery(SESSION_EXPIRED);
      return;
    }

    // Drop the state before any await so a double tap cannot create the game twice
    this.services.creationStates.delete(ownerTelegramId);

    let game: Game;
    try {
      const locationId = state.data.locationId ?? (await this.createTypedLocation(state)).id;
      game = await this.services.gameService.createGame({
        group_id: state.groupId,
        creator_id: state.userId,
        sport_id: state.data.sportId!,
        game_date: state.data.gameDate!,
        location_id: locationId,
        min_participants: state.data.minParticipants!,
        max_participants: state.data.maxParticipants!,
        cost: state.data.cost,
        notes: state.data.notes,
        type: config.type,
      });
    } catch (error) {
      console.error(`Error creating ${config.type}:`, error);
      // Nothing was created, so let the user press "Создать" again
      this.services.creationStates.set(ownerTelegramId, state);
      await ctx.answerCbQuery(config.createFailedToast);
      await ctx.reply(config.createFailed);
      return;
    }

    await ctx.answerCbQuery(config.createdToast);

    // createGame returns the bare row; the card needs sport and location names
    const created = (await this.services.gameService.getGameById(game.id)) ?? game;

    // Admin buttons exist only in private chats, so the lookup is pointless in a group
    const inGroup = ctx.chat?.type !== 'private';
    let isAdmin = false;
    if (!inGroup) {
      const user = await this.services.userService.getUserByTelegramId(ownerTelegramId);
      isAdmin = user ? await this.services.groupService.isUserAdmin(user.id, state.groupId) : false;
    }

    await ctx.editMessageText(`${config.buildCreated(created)}\n\nУчастники могут записаться прямо здесь:`, {
      parse_mode: 'Markdown',
      ...KeyboardBuilder.createGameActionsKeyboard(game.id, 0, isAdmin, 0, inGroup, undefined, created),
    });

    await this.services.notificationService.mentionMembers(state.groupId);
  }

  async cancel(ctx: Context, type: GameType, ownerTelegramId: number): Promise<void> {
    const config = CREATION_CONFIGS[type];
    if (ctx.from!.id !== ownerTelegramId) {
      await ctx.answerCbQuery(config.notYours);
      return;
    }

    const state = this.services.creationStates.get(ownerTelegramId);
    if (!state || state.type !== type) {
      await ctx.answerCbQuery(SESSION_EXPIRED);
      return;
    }

    this.services.creationStates.delete(ownerTelegramId);
    await ctx.answerCbQuery('Отменено');
    await ctx.editMessageText(config.cancelled);
  }

  // ── Quick format ─────────────────────────────────────────────────────────

  private async handleQuickInput(ctx: Context, state: CreationState, text: string): Promise<void> {
    const config = CREATION_CONFIGS[state.type];
    const result = config.parseQuick(text.split(' / ').map((part) => part.trim()));
    if (!result.ok) {
      await ctx.reply(result.error);
      return;
    }

    Object.assign(state.data, result.data);
    state.data.locationId = undefined;
    state.data.locationName = result.location?.name;
    state.data.locationMapUrl = result.location?.mapUrl;
    state.step = result.location ? 'confirm' : 'location';
    this.services.creationStates.set(ctx.from!.id, state);

    if (result.location) {
      await this.showConfirmation(this.replySender(ctx), state, ctx.from!.id);
    } else {
      await this.promptLocation(this.replySender(ctx), state);
    }
  }

  // ── Step-by-step input ───────────────────────────────────────────────────

  private async handleDate(ctx: Context, state: CreationState, text: string): Promise<void> {
    const result = GameCreationValidator.parseDate(text);
    if (!result.success) {
      await ctx.reply(result.error!);
      return;
    }

    state.data.gameDate = result.date;
    await this.advance(ctx, state, this.replySender(ctx), CREATION_CONFIGS[state.type].ack.date?.(state));
  }

  private async handleLocation(ctx: Context, state: CreationState, text: string): Promise<void> {
    const result = GameCreationValidator.validateLocation(text);
    if (!result.success) {
      await ctx.reply(result.error!);
      return;
    }

    state.data.locationId = undefined;
    state.data.locationName = text;
    state.data.locationMapUrl = undefined;
    await this.advance(ctx, state, this.replySender(ctx));
  }

  private async handleMinParticipants(ctx: Context, state: CreationState, text: string): Promise<void> {
    const config = CREATION_CONFIGS[state.type];
    const max = state.data.maxParticipants ?? config.limits.maxCeiling;
    const result = GameCreationValidator.validateMinParticipants(text, max, config.limits.floor);
    if (!result.success) {
      await ctx.reply(config.errors.invalidMin?.(max) ?? result.error!);
      return;
    }

    state.data.minParticipants = result.value;
    await this.advance(ctx, state, this.replySender(ctx), config.ack.min_participants?.(state));
  }

  private async handleMaxParticipants(ctx: Context, state: CreationState, text: string): Promise<void> {
    const config = CREATION_CONFIGS[state.type];

    if (config.dashShortcuts && text === '-') {
      state.data.maxParticipants = UNLIMITED_PARTICIPANTS;
    } else {
      const result = GameCreationValidator.validateMaxParticipants(text, config.limits.maxCeiling, config.limits.floor);
      if (!result.success) {
        await ctx.reply(config.errors.invalidMax ?? result.error!);
        return;
      }

      const min = state.data.minParticipants;
      if (min !== undefined && result.value! < min) {
        await ctx.reply(`❌ Максимум (${result.value}) не может быть меньше минимума (${min})`);
        return;
      }
      state.data.maxParticipants = result.value;
    }

    await this.advance(ctx, state, this.replySender(ctx), config.ack.max_participants?.(state));
  }

  private async handleCost(ctx: Context, state: CreationState, text: string): Promise<void> {
    const config = CREATION_CONFIGS[state.type];

    if (config.dashShortcuts && text === '-') {
      state.data.cost = 0;
    } else {
      const result = GameCreationValidator.validateCost(text);
      if (!result.success) {
        await ctx.reply(config.errors.invalidCost ?? result.error!);
        return;
      }
      state.data.cost = result.value;
    }

    await this.advance(ctx, state, this.replySender(ctx), config.ack.cost?.(state));
  }

  private async handleNotes(ctx: Context, state: CreationState, text: string): Promise<void> {
    if (text !== '-') {
      const result = GameCreationValidator.validateNotes(text);
      if (!result.success) {
        await ctx.reply(result.error!);
        return;
      }
      state.data.notes = text;
    }

    await this.advance(ctx, state, this.replySender(ctx));
  }

  // ── Shared plumbing ──────────────────────────────────────────────────────

  /** Moves to the step after the current one and asks its question (or shows the confirmation). */
  private async advance(ctx: Context, state: CreationState, send: Send, ack: string = ''): Promise<void> {
    const next = this.nextStep(state);
    state.step = next;
    this.services.creationStates.set(ctx.from!.id, state);

    if (next === 'confirm') {
      await this.showConfirmation(send, state, ctx.from!.id);
    } else if (next === 'location') {
      await this.promptLocation(send, state);
    } else {
      await send(ack + CREATION_CONFIGS[state.type].ask[next](state));
    }
  }

  private nextStep(state: CreationState): AskStep | 'location' | 'confirm' {
    const { steps } = CREATION_CONFIGS[state.type];
    // A quick line already carries min and max, so a location picked afterwards completes the wizard
    const quickFilled = state.data.minParticipants !== undefined && state.data.maxParticipants !== undefined;
    if (state.step === 'location' && quickFilled) return 'confirm';
    return steps[(steps as ReadonlyArray<string>).indexOf(state.step) + 1] ?? 'confirm';
  }

  private async promptLocation(send: Send, state: CreationState): Promise<void> {
    const locations = await this.services.locationService.getByGroupAndSport(state.groupId, state.data.sportId!);
    if (locations.length === 0) {
      await send(NO_LOCATIONS_PROMPT);
    } else {
      await send('📍 Выберите место проведения:', KeyboardBuilder.buildLocationSelectionKeyboard(locations));
    }
  }

  private async showConfirmation(send: Send, state: CreationState, telegramId: number): Promise<void> {
    const config: CreationConfig = CREATION_CONFIGS[state.type];
    await send(config.buildConfirmation(state), config.confirmationKeyboard(telegramId));
  }

  private createTypedLocation(state: CreationState): ReturnType<LocationService['findOrCreate']> {
    const { locationName, sportId, locationMapUrl } = state.data;
    return this.services.locationService.findOrCreate(locationName!, sportId!, state.groupId, locationMapUrl);
  }

  private replySender(ctx: Context): Send {
    return (text, keyboard) => ctx.reply(text, keyboard);
  }

  private editSender(ctx: Context): Send {
    return (text, keyboard) => ctx.editMessageText(text, keyboard);
  }
}
