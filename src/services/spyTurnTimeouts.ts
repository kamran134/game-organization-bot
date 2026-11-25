import { SpyService, SpyTurnTimeout } from './SpyService';
import { NotificationService } from './NotificationService';
import { refreshSpyCard } from './spyCard';
import { turnDeadline } from '../utils/spyRound';

/**
 * Tells the group whose turn it is after the timer passed it on, and refreshes the live card.
 * A failure for one round is logged and never stops the others.
 */
export function createSpyTurnTimeoutHandler(
  spyService: SpyService,
  notifications: NotificationService,
): (timeouts: SpyTurnTimeout[]) => Promise<void> {
  return async (timeouts) => {
    for (const timeout of timeouts) {
      try {
        const event = await spyService.getEvent(timeout.eventId);
        const view = await spyService.getRoundView(timeout.eventId);
        if (event && view) {
          const participants = await spyService.getParticipants(timeout.eventId);
          const next = participants.find((p) => p.user_id === timeout.currentUserId)?.user;
          const { round } = view;
          const deadline = round.turn_started_at
            ? turnDeadline(new Date(round.turn_started_at), event.turn_seconds ?? null)
            : null;
          if (next) await notifications.notifySpyTurn(event, next, round.cycle, deadline);
        }
      } catch (error) {
        console.error(`Failed to announce spy turn timeout for event ${timeout.eventId}:`, error);
      }
      await refreshSpyCard(spyService, notifications, timeout.eventId);
    }
  };
}
