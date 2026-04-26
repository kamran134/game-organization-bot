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
} from './commands';
import { AddLocationCommand } from './commands/AddLocationCommand';
import { ListLocationsCommand } from './commands/ListLocationsCommand';
import { EditLocationCommand } from './commands/EditLocationCommand';
import { NewTrainingCommand, NewTrainingCommandServices } from './commands/NewTrainingCommand';
import { TrainingsCommand } from './commands/TrainingsCommand';
import {
  ActionHandler,
  ActionServices,
  GameActionsHandler,
  GroupActionsHandler,
  GameCreationActionsHandler,
} from './handlers';
import { LocationCreationHandler } from './handlers/LocationCreationHandler';
import { LocationEditHandler } from './handlers/LocationEditHandler';
import { TrainingCreationHandler } from './handlers/TrainingCreationHandler';
import { GamesFilterHandler } from './handlers/GamesFilterHandler';
import { ServiceContainer } from './ServiceContainer';

export class Bot {
  private bot: Telegraf;
  private container: ServiceContainer;
  private commands: (CommandHandler | AddLocationCommand | ListLocationsCommand | EditLocationCommand | NewTrainingCommand | TrainingsCommand)[];
  private handlers: ActionHandler[];

  constructor() {
    const token = process.env.BOT_TOKEN;

    if (!token) {
      throw new Error('BOT_TOKEN is not defined in environment variables');
    }

    this.bot = new Telegraf(token);
    this.container = new ServiceContainer(Database.getInstance());

    this.commands = this.initializeCommands();
    this.handlers = this.initializeHandlers();

    this.setupMiddleware();
    this.registerCommands();
    this.registerHandlers();
    this.container.groupEventHandler.register(this.bot);
    this.setupTextHandlers();
  }

  private initializeCommands(): (CommandHandler | AddLocationCommand | ListLocationsCommand | EditLocationCommand | NewTrainingCommand | TrainingsCommand)[] {
    const c = this.container;

    const services: CommandServices = {
      userService: c.userService,
      groupService: c.groupService,
      gameService: c.gameService,
      sportService: c.sportService,
      gameCreationStates: c.gameCreationStates,
    };

    const trainingCommandServices: NewTrainingCommandServices = {
      userService: c.userService,
      groupService: c.groupService,
      gameService: c.gameService,
      sportService: c.sportService,
      gameCreationStates: c.gameCreationStates,
      locationService: c.locationService,
      trainingCreationStates: c.trainingCreationStates,
    };

    const locationCommandServices = {
      userService: c.userService,
      groupService: c.groupService,
      sportService: c.sportService,
      locationCreationStates: c.locationCreationStates,
      gameCreationStates: c.gameCreationStates,
    };

    return [
      new StartCommand(services),
      new HelpCommand(services),
      new WikiCommand(services),
      new RegisterCommand(services),
      new NewGameCommand(services),
      new AppCommand(services),
      new NewTrainingCommand(trainingCommandServices),
      new GamesCommand(services),
      new TrainingsCommand(services),
      new PlayersCommand(services),
      new MyGroupsCommand(services),
      new CreateGroupCommand(services),
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
      jokeService: c.jokeService,
      gameCreationStates: c.gameCreationStates,
      locationEditStates: c.locationEditStates,
      locationEditFlow: c.locationEditFlow,
    };

    return [
      new GameActionsHandler(services),
      new GroupActionsHandler(services),
      new GameCreationActionsHandler(services),
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

    new TrainingCreationHandler({
      sportService: c.sportService,
      locationService: c.locationService,
      trainingCreationStates: c.trainingCreationStates,
      trainingCreationFlow: c.trainingCreationFlow,
    }).register(this.bot);

    new GamesFilterHandler({
      gameService: c.gameService,
      groupService: c.groupService,
      userService: c.userService,
    }).register(this.bot);

    // Callback: step-based game creation (fallback from WebApp mode)
    this.bot.action(/^newgame_steps_(\d+)_(\d+)$/, async (ctx) => {
      await ctx.answerCbQuery();
      const groupId = parseInt(ctx.match[1]);
      const userId = parseInt(ctx.match[2]);
      const newGameCmd = this.commands.find(cmd => cmd.command === 'newgame') as NewGameCommand;
      if (newGameCmd) await newGameCmd.startStepFlow(ctx, groupId, userId);
    });

    // Callback: step-based training creation (fallback from WebApp mode)
    this.bot.action(/^newtraining_steps_(\d+)_(\d+)$/, async (ctx) => {
      await ctx.answerCbQuery();
      const groupId = parseInt(ctx.match[1]);
      const userId = parseInt(ctx.match[2]);
      const trainingCmd = this.commands.find(cmd => cmd.command === 'newtraining') as NewTrainingCommand;
      if (trainingCmd) await trainingCmd.startStepFlow(ctx, groupId, userId);
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
    });
  }

  private setupTextHandlers() {
    const c = this.container;

    this.bot.on('text', async (ctx) => {
      if (!ctx.from || !ctx.message) return;

      const userId = ctx.from.id;
      const text = ctx.message.text.trim();

      if (text.startsWith('/')) return;

      if (c.trainingCreationStates.has(userId)) {
        await c.trainingCreationFlow.handleTextInput(ctx, userId, text);
        return;
      }

      if (c.gameCreationStates.has(userId)) {
        await c.gameCreationFlow.handleTextInput(ctx, userId, text);
        return;
      }

      const createGroupCmd = this.commands.find(cmd => cmd.command === 'creategroup') as CreateGroupCommand;
      if (createGroupCmd?.hasPendingState(userId)) {
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
          replyText.includes('Создание новой тренировки') ||
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
      await this.bot.launch();
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
