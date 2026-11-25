import { SpyEvent, SpyStatus } from '../../models/SpyEvent';
import { SpyRound, SpyRoundStatus } from '../../models/SpyRound';
import type { SpyOutcome, SpyOutcomeReason } from '../../models/SpyRound';
import { SpyRoundPlayer } from '../../models/SpyRoundPlayer';
import { SpyRole } from '../../models/SpyRole';
import { User } from '../../models/User';
import { escapeHtml, formatDate } from '../../utils/helpers';
import { SPY_ROLE_NAME } from '../../utils/spyDeal';
import { turnDeadline } from '../../utils/spyRound';
import { formatMention } from './formatters';
import { webAppLink } from './webAppLink';

export type SpyButton = { text: string; url: string } | { text: string; callback_data: string };

export interface SpyKeyboard {
  inline_keyboard: SpyButton[][];
}

/** The state of an ongoing ballot, as far as the caller can tell; null/absent means "unknown", not "empty". */
export interface SpyCardVoting {
  ballot: number;
  /** Everyone who has already voted in this ballot. */
  voterIds: number[];
  counts: Array<{ userId: number; votes: number }>;
  /** Targets allowed in this ballot (the leaders of a tie); absent = every living player. */
  candidateIds?: number[];
}

/** A player of the card: `role` is null until the round is finished (the service withholds it). */
export type SpyCardPlayer = Pick<SpyRoundPlayer, 'user_id' | 'user' | 'is_eliminated'> & { role: SpyRole | null };

/** The latest round of the evening with its players (users loaded). Roles are present only once the round is finished. */
export interface SpyCardRound {
  round: SpyRound;
  players: SpyCardPlayer[];
  voting?: SpyCardVoting | null;
}

/** Url button (web_app buttons do not work in group chats) that opens the event page. */
export function spyButton(text: string, eventId: number): SpyKeyboard {
  return { inline_keyboard: [[urlButton(text, eventId)]] };
}

function urlButton(text: string, eventId: number): SpyButton {
  return { text, url: webAppLink(`spy_${eventId}`) };
}

const ROLE_ORDER: SpyRole[] = [SpyRole.SPY, SpyRole.DOUBLE_AGENT, SpyRole.MR_WHITE, SpyRole.CIVILIAN];

const OUTCOME_TEXT: Record<SpyOutcome, string> = {
  town: '🏆 Победили мирные',
  spies: '🕵️ Победили шпионы',
  aborted: '⛔ Партия прервана',
};

const REASON_TEXT: Record<SpyOutcomeReason, string> = {
  vote_hit: 'шпион разоблачён голосованием',
  vote_miss: 'голосование указало на невиновного',
  guess_correct: 'шпион угадал локацию',
  guess_wrong: 'шпион назвал неверную локацию',
  manual: 'закрыта организатором',
};

/**
 * The reveal of a finished round: location, who was who and the result. Shared by the live card and the
 * group announcement, so it is the only place where roles are written out.
 */
export function formatSpyReveal(round: SpyRound, players: Array<Pick<SpyRoundPlayer, 'user_id' | 'user' | 'role'>>): string[] {
  const lines = [`📍 Локация: <b>${escapeHtml(round.location_name)}</b>`, '', '🎭 Роли:'];
  const sorted = [...players].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
  for (const player of sorted) {
    lines.push(`• ${escapeHtml(player.user?.fullName ?? 'Игрок')} — ${SPY_ROLE_NAME[player.role]}`);
  }

  lines.push('');
  const outcome = round.outcome ? OUTCOME_TEXT[round.outcome] : OUTCOME_TEXT.aborted;
  const reason = round.outcome_reason ? ` (${REASON_TEXT[round.outcome_reason]})` : '';
  lines.push(`${outcome}${reason}`);
  if (round.guess) {
    const guesser = players.find((p) => p.user_id === round.guessed_by)?.user;
    lines.push(`💬 ${guesser ? `${escapeHtml(guesser.fullName)} назвал(а)` : 'Названо'}: «${escapeHtml(round.guess)}»`);
  }
  return lines;
}

const TIME_FORMAT = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/**
 * Live group card of a Spy evening (HTML): posted on creation, re-posted by /spy and edited after every state
 * change. Until the round is finished it names neither the location nor any role.
 */
export function formatSpyCard(
  event: SpyEvent,
  participants: User[],
  current: SpyCardRound | null = null,
): { text: string; reply_markup: SpyKeyboard } {
  const lines = [`🕵️ <b>${escapeHtml(event.title)}</b>`];
  if (event.starts_at) lines.push(`📅 ${escapeHtml(formatDate(new Date(event.starts_at)))}`);
  if (event.place) lines.push(`📍 ${escapeHtml(event.place)}`);
  if (event.host) lines.push(`👤 Организатор: ${escapeHtml(event.host.fullName)}`);
  if (event.description) lines.push(escapeHtml(event.description));
  lines.push('');

  switch (event.status) {
    case SpyStatus.REGISTRATION: {
      const left = Math.max(event.max_players - participants.length, 0);
      lines.push(`👥 Игроки: ${participants.length} / ${event.max_players}`);
      participants.forEach((p, i) => lines.push(`${i + 1}. ${escapeHtml(p.fullName)}`));
      lines.push('', left === 0 ? '⛔ Мест нет' : `Свободно мест: ${left}. Записывайтесь 👇`);

      const row: SpyButton[] = [];
      if (left > 0) row.push({ text: '✅ Участвую', callback_data: `spy_join_${event.id}` });
      row.push({ text: '🚪 Выйти', callback_data: `spy_leave_${event.id}` });
      return {
        text: lines.join('\n'),
        reply_markup: {
          inline_keyboard: [
            row,
            [{ text: '🔒 Закрыть набор', callback_data: `spy_close_${event.id}` }],
            [urlButton('🕵️ Открыть', event.id)],
          ],
        },
      };
    }
    case SpyStatus.CLOSED:
      lines.push(`👥 Состав: ${participants.length}`);
      participants.forEach((p, i) => lines.push(`${i + 1}. ${escapeHtml(p.fullName)}`));
      lines.push('', '🔒 Набор закрыт');
      return {
        text: lines.join('\n'),
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎬 Начать партию', callback_data: `spy_start_${event.id}` }],
            [urlButton('🕵️ Открыть', event.id)],
          ],
        },
      };
    case SpyStatus.IN_PROGRESS:
      return current ? formatRound(event, participants, current, lines) : formatWaiting(event, participants, lines);
    default:
      lines.push('🏁 Вечер завершён');
      return { text: lines.join('\n'), reply_markup: { inline_keyboard: [] } };
  }
}

/** An evening in progress with no round on record: only the start button makes sense. */
function formatWaiting(event: SpyEvent, participants: User[], lines: string[]): { text: string; reply_markup: SpyKeyboard } {
  lines.push(`👥 Состав: ${participants.length}`);
  return {
    text: lines.join('\n'),
    reply_markup: {
      inline_keyboard: [
        [{ text: '🎬 Начать партию', callback_data: `spy_start_${event.id}` }],
        [urlButton('🕵️ Открыть', event.id)],
      ],
    },
  };
}

function formatRound(
  event: SpyEvent,
  participants: User[],
  { round, players, voting }: SpyCardRound,
  lines: string[],
): { text: string; reply_markup: SpyKeyboard } {
  const userOf = (userId: number): User | undefined =>
    players.find((p) => p.user_id === userId)?.user ?? participants.find((u) => u.id === userId);
  const nameOf = (userId: number): string => escapeHtml(userOf(userId)?.fullName ?? 'Игрок');
  const isGone = (userId: number): boolean => players.find((p) => p.user_id === userId)?.is_eliminated ?? false;

  if (round.status === SpyRoundStatus.FINISHED) {
    lines.push(`🎬 <b>Партия №${round.number} окончена</b>`, '', ...formatSpyReveal(round, players.flatMap((p) => (p.role === null ? [] : [{ ...p, role: p.role }]))));
    return {
      text: lines.join('\n'),
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎬 Ещё партия', callback_data: `spy_start_${event.id}` }],
          [urlButton('🕵️ Открыть', event.id)],
        ],
      },
    };
  }

  if (round.status === SpyRoundStatus.VOTING) {
    lines.push(`🗳 <b>Партия №${round.number} — голосование</b>`);
    if (voting && voting.ballot > 1) lines.push(`Тур ${voting.ballot}: голосуем только за лидеров`);

    const alive = round.turn_order.filter((id) => !isGone(id));
    if (voting) {
      const voted = voting.voterIds.filter((id) => alive.includes(id));
      lines.push('', `✅ Проголосовали (${voted.length} из ${alive.length}): ${voted.length > 0 ? voted.map(nameOf).join(', ') : 'пока никто'}`);
      if (voting.counts.length > 0) {
        lines.push('', '📊 Счёт:');
        for (const { userId, votes } of voting.counts) lines.push(`• ${nameOf(userId)} — ${votes}`);
      }
    }

    const candidates = alive.filter((id) => !voting?.candidateIds || voting.candidateIds.includes(id));
    const rows: SpyButton[][] = [];
    for (let i = 0; i < candidates.length; i += 2) {
      rows.push(candidates.slice(i, i + 2).map((id) => ({
        text: userOf(id)?.fullName ?? 'Игрок',
        callback_data: `spy_vote_${event.id}_${id}`,
      })));
    }
    rows.push([urlButton('🕵️ Открыть', event.id)]);
    lines.push('', 'Кто шпион? Выберите подозреваемого 👇');
    return { text: lines.join('\n'), reply_markup: { inline_keyboard: rows } };
  }

  lines.push(`🎬 <b>Партия №${round.number}</b> · круг ${round.cycle}`);
  const currentId = round.turn_order[round.turn_index];
  const currentUser = currentId === undefined ? undefined : userOf(currentId);
  if (currentUser) lines.push('', `🗣 Сейчас говорит: ${formatMention(currentUser)}`);
  const deadline = round.turn_started_at ? turnDeadline(new Date(round.turn_started_at), event.turn_seconds ?? null) : null;
  if (deadline) lines.push(`⏱ Ход до ${TIME_FORMAT.format(deadline)}`);

  lines.push('', '🔄 Порядок хода:');
  round.turn_order.forEach((id, i) => {
    const name = nameOf(id);
    const label = isGone(id) ? `<s>${name}</s>` : name;
    lines.push(`${id === currentId ? '▶️' : `${i + 1}.`} ${label}`);
  });

  return {
    text: lines.join('\n'),
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🗣 Я сказал', callback_data: `spy_next_${event.id}` },
          { text: '🗳 Голосование', callback_data: `spy_voting_${event.id}` },
        ],
        [urlButton('🕵️ Открыть', event.id)],
      ],
    },
  };
}
