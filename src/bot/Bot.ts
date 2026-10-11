import { Telegraf } from 'telegraf';
import { Database } from '../database/Database';
import {
  CommandHandler,
  CommandServices,
  StartCommand,
  HelpCommand,
  WikiCommand,
  RegisterCommand,
  NewGameCommand,
  GamesCommand,
  MyGroupsCommand,
  CreateGroupCommand,
  AppCommand,
  PlayersCommand,
  PaymentsCommand,
  TrainingPaymentsCommand,
} from './commands';
import { AddLocationCommand } from './commands/AddLocationCommand';
import { ListLocationsCommand } from './commands/ListLocationsCommand';
import { EditLocationCommand } from './commands/EditLocationCommand';
import { NewTrainingCommand } from './commands/NewTrainingCommand';
import { NewGameCommandServices } from './commands/NewGameCommand';
import { TrainingsCommand } from './commands/TrainingsCommand';
import {
  ActionHandler,
  ActionServices,
  GameActionsHandler,
  GroupActionsHandler,
} from './handlers';
import { LocationCreationHandler } from './handlers/LocationCreationHandler';
import { LocationEditHandler } from './handlers/LocationEditHandler';
import { CreationHandler } from './handlers/CreationHandler';
import { GamesFilterHandler } from './handlers/GamesFilterHandler';
import { ServiceContainer } from './ServiceContainer';
import { GameLifecycleService } from '../services/GameLifecycleService';
import { isWizardInput } from './utils/wizardInput';

export class Bot {
  private bot: Telegraf;
  private container: ServiceContainer;
  private commands: (CommandHandler | AddLocationCommand | ListLocationsCommand | EditLocationCommand | NewTrainingCommand | TrainingsCommand | PaymentsCommand | TrainingPaymentsCommand)[];
  private handlers: ActionHandler[];

  constructor() {
    const token = process.env.BOT_TOKEN;

    if (!token) {
      throw new Error('BOT_TOKEN is not defined in environment variables');
    }

    this.bot = new Telegraf(token);
    this.container = new ServiceContainer(Database.getInstance(), this.bot.telegram);

    this.commands = this.initializeCommands();
    this.handlers = this.initializeHandlers();

    this.setupMiddleware();
    this.registerCommands();
    this.registerHandlers();
    this.container.groupEventHandler.register(this.bot);
    this.setupTextHandlers();
  }

  /** Exposed so the process entry point can run the periodic cancel/complete job. */
  get gameLifecycleService(): GameLifecycleService {
    return this.container.gameLifecycleService;
  }

  private initializeCommands(): (CommandHandler | AddLocationCommand | ListLocationsCommand | EditLocationCommand | NewTrainingCommand | TrainingsCommand | PaymentsCommand | TrainingPaymentsCommand)[] {
    const c = this.container;

    const services: CommandServices = {
      userService: c.userService,
      groupService: c.groupService,
      gameService: c.gameService,
      sportService: c.sportService,
    };

    const creationCommandServices: NewGameCommandServices = { ...services, creationFlow: c.creationFlow };

    const locationCommandServices = {
      userService: c.userService,
      groupService: c.groupService,
      sportService: c.sportService,
      locationCreationStates: c.locationCreationStates,
    };

    return [
      new StartCommand(services),
      new HelpCommand(services),
      new WikiCommand(services),
      new RegisterCommand(services),
      new NewGameCommand(creationCommandServices),
      new AppCommand(services),
      new NewTrainingCommand(creationCommandServices),
      new GamesCommand(services),
      new TrainingsCommand(services),
      new PlayersCommand(services),
      new MyGroupsCommand(services),
      new CreateGroupCommand(services),
      new PaymentsCommand({
        ...services,
        paymentService: c.paymentService,
      }),
      new TrainingPaymentsCommand({
        ...services,
        paymentService: c.paymentService,
      }),
      new AddLocationCommand(locationCommandServices),
      new ListLocationsCommand({
        locationService: c.locationService,
        groupService: c.groupService,
        userService: c.userService,
      }),
      new EditLocationCommand({
        locationService: c.locationService,
        groupService: c.groupService,
        userService: c.userService,
        locationEditStates: c.locationEditStates,
        locationEditFlow: c.locationEditFlow,
      }),
    ];
  }

  private registerCommands() {
    this.commands.forEach(command => {
      this.bot.command(command.command, (ctx) => command.execute(ctx));
    });
  }

  private initializeHandlers(): ActionHandler[] {
    const c = this.container;

    const services: ActionServices = {
      userService: c.userService,
      groupService: c.groupService,
      gameService: c.gameService,
      sportService: c.sportService,
      locationService: c.locationService,
      notificationService: c.notificationService,
      gameLifecycleService: c.gameLifecycleService,
      locationEditStates: c.locationEditStates,
      locationEditFlow: c.locationEditFlow,
    };

    return [
      new GameActionsHandler(services),
      new GroupActionsHandler(services),
    ];
  }

  private registerHandlers() {
    const c = this.container;

    this.handlers.forEach(handler => handler.register(this.bot));

    new LocationCreationHandler({
      locationManagementFlow: c.locationManagementFlow,
      locationCreationStates: c.locationCreationStates,
    }).register(this.bot);

    new LocationEditHandler({
      locationService: c.locationService,
      sportService: c.sportService,
      locationEditStates: c.locationEditStates,
      locationEditFlow: c.locationEditFlow,
    }).register(this.bot);

    new CreationHandler({
      creationStates: c.creationStates,
      creationFlow: c.creationFlow,
    }).register(this.bot);

    new GamesFilterHandler({
      gameService: c.gameService,
      groupService: c.groupService,
      userService: c.userService,
    }).register(this.bot);

    // Callback: show payment summary for selected game
    this.bot.action(/^show_payments_(\d+)$/, async (ctx) => {
      await ctx.answerCbQuery();
      const gameId = parseInt(ctx.match[1]);
      const paymentsCmd = this.commands.find(cmd => cmd.command === 'payments') as PaymentsCommand;
      if (paymentsCmd) await paymentsCmd.showGamePaymentsById(ctx, gameId);
    });
  }

  private setupMiddleware() {
    // Auto-register users on first interaction
    this.bot.use(async (ctx, next) => {
      if (ctx.from && !ctx.from.is_bot) {
        try {
          await this.container.userService.findOrCreateUser(ctx.from);
        } catch (error) {
          console.error('Error in user auto-registration:', error);
        }
      }
      return next();
    });

    // Error handling
    this.bot.catch((err, ctx) => {
      console.error('❌ Bot error:', err);
      console.error('Context:', {
        updateType: ctx.updateType,
        chat: ctx.chat,
        from: ctx.from,
      });

      // A crashed callback handler must not leave the button spinner hanging
      if (ctx.callbackQuery) {
        ctx.answerCbQuery('❌ Произошла ошибка').catch(() => undefined);
      }
    });
  }

  private setupTextHandlers() {
    const c = this.container;

    this.bot.on('text', async (ctx) => {
      if (!ctx.from || !ctx.message) return;

      const userId = ctx.from.id;
      const text = ctx.message.text.trim();

      if (text.startsWith('/')) return;

      // In groups the bot sees every message; wizards only take replies to the bot's own prompts
      const wizardInput = isWizardInput(ctx);

      if (wizardInput && c.creationStates.has(userId)) {
        await c.creationFlow.handleTextInput(ctx, userId, text);
        return;
      }

      const createGroupCmd = this.commands.find(cmd => cmd.command === 'creategroup') as CreateGroupCommand;
      if (wizardInput && createGroupCmd?.hasPendingState(userId)) {
        await createGroupCmd.handleTextInput(ctx, userId, text);
        return;
      }

      // Lost session: only prompt when the user is replying to a creation-flow message
      const replyTo = ctx.message.reply_to_message;
      if (replyTo && 'from' in replyTo && replyTo.from?.id === ctx.botInfo.id) {
        const replyText = ('text' in replyTo && replyTo.text) ? replyTo.text : '';
        const isCreationMessage =
          replyText.includes('Введите дату') ||
          replyText.includes('Введите максимальное') ||
          replyText.includes('Введите минимальное') ||
          replyText.includes('Введите стоимость') ||
          replyText.includes('Добавьте дополнительные заметки') ||
          replyText.includes('Выберите место') ||
          replyText.includes('Введите место') ||
          replyText.includes('Введите название места') ||
          replyText.includes('Создание новой игры') ||
          replyText.includes('Создание тренировки') ||
          replyText.includes('Ответьте (reply) на это сообщение');
        if (isCreationMessage) {
          await ctx.reply('⚠️ Сессия создания истекла (бот был перезапущен).\n\nНачните заново:\n/newgame — создать игру\n/newtraining — создать тренировку');
        }
      }
    });
  }

  async start() {
    console.log('🔄 Launching bot...');
    try {
      await this.bot.launch({
        // 'chat_member' не входит в дефолтный набор апдейтов Telegram — нужен явно,
        // чтобы отслеживать выход/удаление обычных участников из группы.
        allowedUpdates: ['message', 'callback_query', 'my_chat_member', 'chat_member'],
      });
      console.log('✅ Bot launched and listening for updates');
    } catch (error) {
      console.error('❌ Error launching bot:', error);
      throw error;
    }
  }

  stop(signal: string) {
    console.log(`\n⚠️ Received ${signal}, stopping bot...`);
    this.bot.stop(signal);
  }
}
