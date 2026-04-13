import { Database } from '../database/Database';
import { UserService } from '../services/UserService';
import { GroupService } from '../services/GroupService';
import { GameService } from '../services/GameService';
import { SportService } from '../services/SportService';
import { LocationService } from '../services/LocationService';
import { JokeService } from '../services/JokeService';
import { GameCreationStateManager } from '../utils/GameCreationState';
import { TrainingCreationStateManager } from '../utils/TrainingCreationState';
import { LocationCreationStateManager } from '../utils/LocationCreationState';
import { LocationEditStateManager } from '../utils/LocationEditState';
import { GameCreationFlow, GameCreationServices } from './flows';
import { TrainingCreationFlow } from './flows/TrainingCreationFlow';
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

  // State managers
  readonly gameCreationStates: GameCreationStateManager;
  readonly trainingCreationStates: TrainingCreationStateManager;
  readonly locationCreationStates: LocationCreationStateManager;
  readonly locationEditStates: LocationEditStateManager;

  // Flows
  readonly gameCreationFlow: GameCreationFlow;
  readonly trainingCreationFlow: TrainingCreationFlow;
  readonly locationManagementFlow: LocationManagementFlow;
  readonly locationEditFlow: LocationEditFlow;

  // Special event handler shared across the bot lifecycle
  readonly groupEventHandler: GroupEventHandler;

  constructor(private readonly db: Database) {
    // ── Services ──────────────────────────────────────────────────────────────
    this.userService = new UserService(db);
    this.groupService = new GroupService(db);
    this.gameService = new GameService(db);
    this.sportService = new SportService(db);
    this.locationService = new LocationService(db);
    this.jokeService = new JokeService();

    // ── State managers ────────────────────────────────────────────────────────
    this.gameCreationStates = new GameCreationStateManager();
    this.trainingCreationStates = new TrainingCreationStateManager();
    this.locationCreationStates = new LocationCreationStateManager();
    this.locationEditStates = new LocationEditStateManager();

    // ── Flows ─────────────────────────────────────────────────────────────────
    const gameFlowServices: GameCreationServices = {
      gameService: this.gameService,
      sportService: this.sportService,
      locationService: this.locationService,
      gameCreationStates: this.gameCreationStates,
    };
    this.gameCreationFlow = new GameCreationFlow(gameFlowServices);

    this.trainingCreationFlow = new TrainingCreationFlow({
      gameService: this.gameService,
      sportService: this.sportService,
      locationService: this.locationService,
      trainingCreationStates: this.trainingCreationStates,
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
