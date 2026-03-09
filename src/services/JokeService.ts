import Groq from 'groq-sdk';

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
  private groq: Groq | null = null;

  constructor() {
    const apiKey = process.env.GROQ_API_KEY;
    if (apiKey) {
      this.groq = new Groq({ apiKey });
      console.log('JokeService: Groq initialized ✅');
    } else {
      console.warn('JokeService: GROQ_API_KEY not set, using fallback jokes ⚠️');
    }
  }

  async getDeclineJoke(userName: string): Promise<string> {
    if (!this.groq) {
      return this.getRandomFallback();
    }

    try {
      const completion = await this.groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'user',
            content: `Придумай одну короткую смешную шутку (1-2 предложения максимум) на тему того, что игрок по имени ${userName} отказался от участия в спортивной игре или тренировке. Шутка должна быть добродушной, без оскорблений. Отвечай только текстом шутки, без кавычек и пояснений.`,
          },
        ],
        max_tokens: 100,
      });

      const joke = completion.choices[0]?.message?.content?.trim();
      if (!joke) return this.getRandomFallback();
      return joke;
    } catch (error) {
      console.error('JokeService: Groq API error:', error);
      return this.getRandomFallback();
    }
  }

  private getRandomFallback(): string {
    return FALLBACK_JOKES[Math.floor(Math.random() * FALLBACK_JOKES.length)];
  }
}

export const jokeService = new JokeService();
