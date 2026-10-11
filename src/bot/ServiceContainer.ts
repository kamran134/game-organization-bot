import { Database } from '../database/Database';
import { UserService } from '../services/UserService';
import { GroupService } from '../services/GroupService';
import { GameService } from '../services/GameService';
import { SportService } from '../services/SportService';
import { LocationService } from '../services/LocationService';
import { JokeService } from '../services/JokeService';
import { PaymentService } from '../services/PaymentService';
import { NotificationService } from '../services/NotificationService';
import { GameLifecycleService } from '../services/GameLifecycleService';
import { Telegram } from 'telegraf';
import { CreationStateManager } from '../utils/CreationState';
import { LocationCreationStateManager } from '../utils/LocationCreationState';
import { LocationEditStateManager } from '../utils/LocationEditState';
import { CreationFlow } from './flows/CreationFlow';
import { LocationManagementFlow } from './flows/LocationManagementFlow';
import { LocationEditFlow } from './flows/LocationEditFlow';
import { GroupEventHandler, GroupEventServices } from './handlers';

/**
 * Owns and wires all application-level dependencies.
 * Bot receives a single ServiceContainer instead of instantiating services itself.
 */
export class ServiceContainer {
  // Services
  readonly userService: UserService;
  readonly groupService: GroupService;
  readonly gameService: GameService;
  readonly sportService: SportService;
  readonly locationService: LocationService;
  readonly jokeService: JokeService;
  readonly paymentService: PaymentService;
  readonly notificationService: NotificationService;
  readonly gameLifecycleService: GameLifecycleService;

  // State managers
  readonly creationStates: CreationStateManager;
  readonly locationCreationStates: LocationCreationStateManager;
  readonly locationEditStates: LocationEditStateManager;

  // Flows
  readonly creationFlow: CreationFlow;
  readonly locationManagementFlow: LocationManagementFlow;
  readonly locationEditFlow: LocationEditFlow;

  // Special event handler shared across the bot lifecycle
  readonly groupEventHandler: GroupEventHandler;

  constructor(private readonly db: Database, telegram: Telegram) {
    // ── Services ──────────────────────────────────────────────────────────────
    this.userService = new UserService(db);
    this.groupService = new GroupService(db);
    this.gameService = new GameService(db);
    this.sportService = new SportService(db);
    this.locationService = new LocationService(db);
    this.jokeService = new JokeService();
    this.paymentService = new PaymentService(db);
    this.notificationService = new NotificationService(telegram, this.groupService, this.jokeService);
    this.gameLifecycleService = new GameLifecycleService(db, this.notificationService);

    // ── State managers ────────────────────────────────────────────────────────
    this.creationStates = new CreationStateManager();
    this.locationCreationStates = new LocationCreationStateManager();
    this.locationEditStates = new LocationEditStateManager();

    // ── Flows ─────────────────────────────────────────────────────────────────
    this.creationFlow = new CreationFlow({
      gameService: this.gameService,
      groupService: this.groupService,
      userService: this.userService,
      sportService: this.sportService,
      locationService: this.locationService,
      notificationService: this.notificationService,
      creationStates: this.creationStates,
    });

    this.locationManagementFlow = new LocationManagementFlow({
      locationService: this.locationService,
      sportService: this.sportService,
      locationCreationStates: this.locationCreationStates,
    });

    this.locationEditFlow = new LocationEditFlow({
      locationService: this.locationService,
      sportService: this.sportService,
      locationEditStates: this.locationEditStates,
    });

    // ── Event handler ─────────────────────────────────────────────────────────
    const groupEventServices: GroupEventServices = {
      userService: this.userService,
      groupService: this.groupService,
    };
    this.groupEventHandler = new GroupEventHandler(groupEventServices);
  }
}
