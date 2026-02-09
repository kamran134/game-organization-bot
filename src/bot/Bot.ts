import { Telegraf } from 'telegraf';
import { Database } from '../database/Database';
import { UserService } from '../services/UserService';
import { GroupService } from '../services/GroupService';
import { GameService } from '../services/GameService';
import { SportService } from '../services/SportService';
import { LocationService } from '../services/LocationService';
import { GameCreationStateManager } from '../utils/GameCreationState';
import { LocationCreationStateManager } from '../utils/LocationCreationState';
import {
  CommandHandler,
  CommandServices,
  StartCommand,
  HelpCommand,
  RegisterCommand,
  NewGameCommand,
  GamesCommand,
  MyGroupsCommand,
  CreateGroupCommand,
} from './commands';
import { AddLocationCommand } from './commands/AddLocationCommand';
import { ListLocationsCommand } from './commands/ListLocationsCommand';
import {
  ActionHandler,
  ActionServices,
  GameActionsHandler,
  GroupActionsHandler,
  GameCreationActionsHandler,
  GroupEventHandler,
  GroupEventServices,
} from './handlers';
import { LocationCreationHandler } from './handlers/LocationCreationHandler';
import { GameCreationFlow, GameCreationServices } from './flows';
import { LocationManagementFlow } from './flows/LocationManagementFlow';

export class Bot {
  private bot: Telegraf;
  private db: Database;
  private userService: UserService;
  private groupService: GroupService;
  private gameService: GameService;
  private sportService: SportService;
  private locationService: LocationService;
  private gameCreationStates: GameCreationStateManager;
  private commands: (CommandHandler | AddLocationCommand | ListLocationsCommand)[];
  private handlers: ActionHandler[];
  private gameCreationFlow: GameCreationFlow;
  private locationManagementFlow: LocationManagementFlow;
  private locationCreationStates: LocationCreationStateManager;
  private groupEventHandler: GroupEventHandler;

  constructor() {
    const token = process.env.BOT_TOKEN;
    
    if (!token) {
      throw new Error('BOT_TOKEN is not defined in environment variables');
    }

    this.bot = new Telegraf(token);
    this.db = Database.getInstance();
    this.userService = new UserService(this.db);
    this.groupService = new GroupService(this.db);
    this.gameService = new GameService(this.db);
    this.sportService = new SportService(this.db);
    this.locationService = new LocationService();
    this.gameCreationStates = new GameCreationStateManager();
    this.locationCreationStates = new LocationCreationStateManager();

    // Инициализируем game creation flow
    const flowServices: GameCreationServices = {
      gameService: this.gameService,
      sportService: this.sportService,
      locationService: this.locationService,
      gameCreationStates: this.gameCreationStates,
    };
    this.gameCreationFlow = new GameCreationFlow(flowServices);

    // Инициализируем location management flow
    const locationFlowServices = {
      locationService: this.locationService,
      sportService: this.sportService,
      locationCreationStates: this.locationCreationStates,
    };
    this.locationManagementFlow = new LocationManagementFlow(locationFlowServices);

    // Инициализируем group event handler
    const groupEventServices: GroupEventServices = {
      userService: this.userService,
      groupService: this.groupService,
    };
    this.groupEventHandler = new GroupEventHandler(groupEventServices);

    // Инициализируем команды
    this.commands = this.initializeCommands();
    this.handlers = this.initializeHandlers();

    this.setupMiddleware();
    this.registerCommands();
    this.registerHandlers();
    this.groupEventHandler.register(this.bot);
    this.setupTextHandlers();
  }

  private initializeCommands(): (CommandHandler | AddLocationCommand | ListLocationsCommand)[] {
    const services: CommandServices = {
      userService: this.userService,
      groupService: this.groupService,
      gameService: this.gameService,
      sportService: this.sportService,
      gameCreationStates: this.gameCreationStates,
    };

    const locationCommandServices = {
      userService: this.userService,
      groupService: this.groupService,
      sportService: this.sportService,
      locationCreationStates: this.locationCreationStates,
      gameCreationStates: this.gameCreationStates,
    };

    const listLocationsServices = {
      locationService: this.locationService,
      groupService: this.groupService,
    };

    return [
      new StartCommand(services),
      new HelpCommand(services),
      new RegisterCommand(services),
      new NewGameCommand(services),
      new GamesCommand(services),
      new MyGroupsCommand(services),
      new CreateGroupCommand(services),
      new AddLocationCommand(locationCommandServices),
      new ListLocationsCommand(listLocationsServices),
    ];
  }

  private registerCommands() {
    this.commands.forEach(command => {
      this.bot.command(command.command, (ctx) => command.execute(ctx));
    });
  }

  private initializeHandlers(): ActionHandler[] {
    const services: ActionServices = {
      userService: this.userService,
      groupService: this.groupService,
      gameService: this.gameService,
      sportService: this.sportService,
      locationService: this.locationService,
      gameCreationStates: this.gameCreationStates,
    };

    return [
      new GameActionsHandler(services),
      new GroupActionsHandler(services),
      new GameCreationActionsHandler(services),
    ];
  }

  private registerHandlers() {
    this.handlers.forEach(handler => {
      handler.register(this.bot);
    });

    // Регистрируем handler для создания локаций
    const locationHandlerServices = {
      locationManagementFlow: this.locationManagementFlow,
      locationCreationStates: this.locationCreationStates,
    };
    new LocationCreationHandler(this.bot, locationHandlerServices);
  }

  private setupMiddleware() {
    // Auto-register users on first interaction
    this.bot.use(async (ctx, next) => {
      if (ctx.from && !ctx.from.is_bot) {
        try {
          await this.userService.findOrCreateUser(ctx.from);
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
    // Обработка текстовых сообщений для многошаговых диалогов
    this.bot.on('text', async (ctx) => {
      console.log('📝 Text message received:', ctx.message.text);
      
      if (!ctx.from || !ctx.message) return;

      const userId = ctx.from.id;
      const text = ctx.message.text;

      console.log('🔍 User state:', userId);

      // Делегируем обработку в GameCreationFlow
      await this.gameCreationFlow.handleTextInput(ctx, userId, text);
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
