import { GameStatus } from '../models/Game';

export interface StatusRejection {
  /** Error string for the WebApp API (409 body, mapped to Russian by the client). */
  webError: string;
  /** Alert text for the bot's callback answers. */
  botAlert: string;
}

/** Cancelled and completed games no longer accept participation changes; null means the game is open. */
export function rejectionForStatus(status: GameStatus): StatusRejection | null {
  switch (status) {
    case GameStatus.CANCELLED:
      return { webError: 'Game cancelled', botAlert: '❌ Игра отменена' };
    case GameStatus.COMPLETED:
      return { webError: 'Game completed', botAlert: '🏁 Игра уже завершена' };
    default:
      return null;
  }
}
