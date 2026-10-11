import { Context } from 'telegraf';

/**
 * Whether a text message should be consumed by a pending wizard step.
 * In private chats every text counts. In groups the bot sees all messages, so only
 * a reply to one of the bot's own messages counts (the wizard prompts ask for it).
 */
export function isWizardInput(ctx: Context): boolean {
  if (ctx.chat?.type === 'private') return true;
  const message = ctx.message;
  if (!message || !('reply_to_message' in message)) return false;
  const botId = ctx.botInfo?.id;
  return botId !== undefined && message.reply_to_message?.from?.id === botId;
}
