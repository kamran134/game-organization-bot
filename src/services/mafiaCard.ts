import { MafiaService } from './MafiaService';
import { NotificationService } from './NotificationService';

/** Re-reads the event and edits its live group card; call after any state change. Never throws. */
export async function refreshMafiaCard(
  mafiaService: MafiaService,
  notifications: NotificationService,
  eventId: number,
): Promise<void> {
  try {
    const event = await mafiaService.getEvent(eventId);
    if (!event) return;
    const participants = await mafiaService.getParticipants(eventId);
    await notifications.updateMafiaCard(event, participants.map((p) => p.user));
  } catch (error) {
    console.error('Failed to refresh mafia card:', error);
  }
}
