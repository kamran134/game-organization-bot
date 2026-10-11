import { Context } from 'telegraf';
import { CommandHandler, CommandServices } from './base/CommandHandler';
import { PaymentService } from '../../services/PaymentService';
import { currentMonth } from '../../utils/helpers';

export interface TrainingPaymentsCommandServices extends CommandServices {
  paymentService: PaymentService;
}

export class TrainingPaymentsCommand extends CommandHandler {
  private paymentService: PaymentService;

  constructor(services: TrainingPaymentsCommandServices) {
    super(services);
    this.paymentService = services.paymentService;
  }

  get command(): string {
    return 'trainingpayments';
  }

  async execute(ctx: Context): Promise<void> {
    if (!(await this.isGroupOnly(ctx))) return;

    const chatId = ctx.chat!.id;
    const group = await this.services.groupService.getGroupByChatId(chatId);

    if (!group) {
      await ctx.reply('❌ Группа не найдена.');
      return;
    }

    const month = currentMonth();

    const rows = await this.paymentService.getTrainingPaid(group.id, month);

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

function formatMonth(month: string): string {
  const [year, m] = month.split('-');
  const names = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
  ];
  return `${names[parseInt(m) - 1]} ${year}`;
}
