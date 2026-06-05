import { Context } from 'telegraf';
import { CommandHandler, CommandServices } from './base/CommandHandler';
import { Database } from '../../database/Database';

export interface TrainingPaymentsCommandServices extends CommandServices {
  db: Database;
}

export class TrainingPaymentsCommand extends CommandHandler {
  private db: Database;

  constructor(services: TrainingPaymentsCommandServices) {
    super(services);
    this.db = services.db;
  }

  get command(): string {
    return 'trainingpayments';
  }

  async execute(ctx: Context): Promise<void> {
    if (!this.isGroupOnly(ctx)) return;

    const chatId = ctx.chat!.id;
    const group = await this.services.groupService.getGroupByChatId(chatId);

    if (!group) {
      await ctx.reply('❌ Группа не найдена.');
      return;
    }

    const month = currentMonth();

    const rows = await this.db.dataSource.query<Array<{
      first_name: string | null;
      last_name: string | null;
      amount: string;
    }>>(
      `SELECT u.first_name, u.last_name, p.amount
       FROM payments p
       JOIN users u ON u.id = p.user_id
       WHERE p.group_id = $1
         AND p.period_month = $2
         AND p.game_id IS NULL`,
      [group.id, month],
    );

    const header = `🏋️ Оплаты за тренировки — ${formatMonth(month)}`;

    if (rows.length === 0) {
      await ctx.reply(`${header}\n\n💸 Оплат пока нет.`);
      return;
    }

    const payers = rows.map(r =>
      [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Участник',
    );
    const total = rows.reduce((sum, r) => sum + parseFloat(r.amount), 0);
    const list = payers.map(name => `• ${name}`).join('\n');

    await ctx.reply(`${header}\n\n✅ Оплатили (${payers.length}):\n${list}\n\n💵 Итого собрано: ${total.toFixed(2)}`);
  }
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatMonth(month: string): string {
  const [year, m] = month.split('-');
  const names = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
  ];
  return `${names[parseInt(m) - 1]} ${year}`;
}
