import { GoogleGenerativeAI } from '@google/generative-ai';

const FALLBACK_JOKES = [
  'Говорят, лучшие игроки всегда немного опаздывают... или вообще не приходят.',
  'Ничего страшного, диван тоже спорт — особенно когда с пультом.',
  'Как говорил великий тренер: "Нет игрока — нет проблемы".',
  'Зато теперь в команде чётное число игроков. Наверное.',
  'Здоровье дороже! Особенно здоровье дивана, который скучает без тебя.',
  'Профессионалы так и делают: берегут силы для следующего раза.',
  'Отличное решение. Мышцы скажут спасибо. Команда — не факт.',
  'Говорят, лучший игрок тот, который не устаёт. Ты явно в отличной форме.',
];

export class JokeService {
  private genAI: GoogleGenerativeAI | null = null;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
      console.log('JokeService: Gemini initialized ✅');
    } else {
      console.warn('JokeService: GEMINI_API_KEY not set, using fallback jokes ⚠️');
    }
  }

  async getDeclineJoke(userName: string): Promise<string> {
    if (!this.genAI) {
      console.warn('JokeService: genAI is null, returning fallback');
      return this.getRandomFallback();
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

      const prompt = `Придумай одну короткую смешную шутку (1-2 предложения максимум) на тему того, что игрок по имени ${userName} отказался от участия в спортивной игре или тренировке. Шутка должна быть добродушной, без оскорблений. Отвечай только текстом шутки, без кавычек и пояснений.`;

      const result = await model.generateContent(prompt);
      const joke = result.response.text().trim();

      if (!joke) return this.getRandomFallback();
      return joke;
    } catch (error) {
      console.error('JokeService: Gemini API error:', error);
      return this.getRandomFallback();
    }
  }

  private getRandomFallback(): string {
    return FALLBACK_JOKES[Math.floor(Math.random() * FALLBACK_JOKES.length)];
  }
}

export const jokeService = new JokeService();
