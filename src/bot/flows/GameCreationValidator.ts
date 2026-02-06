export interface DateParseResult {
  success: boolean;
  date?: Date;
  error?: string;
}

export interface ParticipantsParseResult {
  success: boolean;
  min?: number;
  max?: number;
  error?: string;
}

export class GameCreationValidator {
  static parseDate(text: string): DateParseResult {
    const dateRegex = /(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?\s+(\d{1,2}):(\d{2})/;
    const match = text.match(dateRegex);

    if (!match) {
      return {
        success: false,
        error: '❌ Неверный формат даты.\n\nИспользуйте формат: ДД.ММ.ГГГГ ЧЧ:ММ\nНапример: 15.02.2026 19:00\nИли короткий: 15.02 19:00',
      };
    }

    const day = parseInt(match[1]);
    const month = parseInt(match[2]) - 1;
    const year = match[3] ? parseInt(match[3]) : new Date().getFullYear();
    const hour = parseInt(match[4]);
    const minute = parseInt(match[5]);

    const gameDate = new Date(year, month, day, hour, minute);

    if (gameDate < new Date()) {
      return {
        success: false,
        error: '❌ Дата игры не может быть в прошлом. Попробуйте снова:',
      };
    }

    return { success: true, date: gameDate };
  }

  static validateLocation(text: string): { success: boolean; error?: string } {
    if (text.length < 3) {
      return {
        success: false,
        error: '❌ Слишком короткое название. Введите адрес или название места:',
      };
    }
    return { success: true };
  }

  static validateMaxParticipants(text: string): { success: boolean; value?: number; error?: string } {
    const max = parseInt(text);

    if (isNaN(max) || max < 2 || max > 100) {
      return { success: false, error: '❌ Укажите число от 2 до 100:' };
    }

    return { success: true, value: max };
  }

  static validateMinParticipants(
    text: string,
    max: number
  ): { success: boolean; value?: number; error?: string } {
    const min = parseInt(text);

    if (isNaN(min) || min < 2 || min > max) {
      return { success: false, error: `❌ Укажите число от 2 до ${max}:` };
    }

    return { success: true, value: min };
  }

  static validateCost(text: string): { success: boolean; value?: number; error?: string } {
    const cost = parseFloat(text);

    if (isNaN(cost) || cost < 0) {
      return { success: false, error: '❌ Укажите число (0 или больше):' };
    }

    return { success: true, value: cost > 0 ? cost : undefined };
  }

  static parseParticipantsRange(text: string): ParticipantsParseResult {
    let minParticipants: number;
    let maxParticipants: number;

    if (text.includes('-')) {
      const [minStr, maxStr] = text.split('-').map((s) => s.trim());
      minParticipants = parseInt(minStr);
      maxParticipants = parseInt(maxStr);

      if (isNaN(minParticipants) || isNaN(maxParticipants)) {
        return {
          success: false,
          error: '❌ Неверный формат участников. Используйте: 5-10 или просто 10',
        };
      }

      if (minParticipants < 2 || minParticipants > maxParticipants) {
        return {
          success: false,
          error: `❌ Минимум должен быть от 2 до ${maxParticipants}`,
        };
      }
    } else {
      maxParticipants = parseInt(text);
      if (isNaN(maxParticipants) || maxParticipants < 2 || maxParticipants > 100) {
        return {
          success: false,
          error: '❌ Неверное количество участников. Укажите число от 2 до 100 или формат 5-10',
        };
      }
      minParticipants = Math.max(2, Math.floor(maxParticipants / 2));
    }

    if (maxParticipants > 100) {
      return {
        success: false,
        error: '❌ Максимум участников не может быть больше 100',
      };
    }

    return { success: true, min: minParticipants, max: maxParticipants };
  }
}
