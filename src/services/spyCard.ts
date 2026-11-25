import { SpyService } from './SpyService';
import { NotificationService } from './NotificationService';
import { SpyStatus } from '../models/SpyEvent';
import type { SpyCardRound } from '../bot/ui/SpyMessageBuilder';

/** Loads what the live card needs beyond the event itself: the latest round with its players and the ballot. */
export async function loadSpyCardRound(spyService: SpyService, eventId: number): Promise<SpyCardRound | null> {
  const view = await spyService.getRoundView(eventId);
  if (!view) return null;
  const voting = await spyService.getVotingState(eventId);
  return { round: view.round, players: view.players, voting };
}

/** Re-reads the event and edits its live group card; call after any state change. Never throws. */
export async function refreshSpyCard(
  spyService: SpyService,
  notifications: NotificationService,
  eventId: number,
): Promise<void> {
  try {
    const event = await spyService.getEvent(eventId);
    if (!event) return;
    const participants = await spyService.getParticipants(eventId);
    const current = event.status === SpyStatus.IN_PROGRESS ? await loadSpyCardRound(spyService, eventId) : null;
    await notifications.updateSpyCard(event, participants.map((p) => p.user), current);
  } catch (error) {
    console.error('Failed to refresh spy card:', error);
  }
}
