import { Telegraf } from 'telegraf';

/**
 * Base class for handlers that register bot actions on demand.
 * Subclasses implement registerHandlers() and are activated via register(bot).
 */
export abstract class BotHandler {
  protected bot!: Telegraf;

  register(bot: Telegraf): void {
    this.bot = bot;
    this.registerHandlers();
  }

  protected abstract registerHandlers(): void;
}
