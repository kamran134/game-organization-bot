/**
 * ARCHIVED FEATURES
 * 
 * Этот файл содержит функционал, который был временно отключен,
 * но может пригодиться в будущем для расширения бота.
 */

// =====================================================
// INVITE CODE FUNCTIONALITY
// =====================================================

/**
 * Обработка присоединения к группе по invite code
 * Использование: /register ABC123
 */
/*
private async handleJoinByInviteCode(ctx: any, inviteCode: string) {
  const user = await this.userService.getUserByTelegramId(ctx.from!.id);
  if (!user) {
    await ctx.reply('❌ Ошибка регистрации пользователя');
    return;
  }

  const group = await this.groupService.getGroupByInviteCode(inviteCode);
  if (!group) {
    await ctx.reply(
      `❌ Группа с кодом \`${inviteCode}\` не найдена.\n\n` +
      `Проверьте правильность кода и попробуйте снова.`
    );
    return;
  }

  try {
    await this.groupService.addMemberToGroup(user.id, group.id);
    await ctx.reply(
      `✅ Вы присоединились к группе "${group.name}"!\n\n` +
      `Используйте /mygroups чтобы увидеть все ваши группы.`,
      Markup.inlineKeyboard([
        [Markup.button.callback('📂 Открыть группу', `group_${group.id}`)],
      ])
    );
  } catch (error: any) {
    if (error.message.includes('already a member')) {
      await ctx.reply(`ℹ️ Вы уже состоите в группе "${group.name}"`);
    } else {
      await ctx.reply('❌ Ошибка при присоединении к группе');
    }
  }
}
*/

/**
 * Команда /register с поддержкой invite code
 */
/*
this.bot.command('register', async (ctx) => {
  const args = ctx.message.text.split(' ');
  
  // Если есть invite code в команде: /register ABC123
  if (args.length > 1) {
    const inviteCode = args[1].toUpperCase();
    await this.handleJoinByInviteCode(ctx, inviteCode);
    return;
  }

  // Иначе показываем список открытых групп или просим ввести код
  await ctx.reply(
    `📝 Присоединение к группе\n\n` +
    `Если у вас есть код приглашения, используйте:\n` +
    `/register КОД\n\n` +
    `Например: /register ABC123`
  );
});
*/

/**
 * Отображение invite code в меню управления группой
 */
/*
const inviteLink = group.invite_code 
  ? `Код приглашения: \`${group.invite_code}\`\n/register ${group.invite_code}`
  : 'Группа открытая';

await ctx.editMessageText(
  `⚙️ Управление группой "${group.name}"\n\n` +
  `${inviteLink}\n\n` +
  `Выберите действие:`,
  Markup.inlineKeyboard([
    [Markup.button.callback('👥 Управление участниками', `manage_members_${groupId}`)],
    [Markup.button.callback('🔗 Обновить код приглашения', `regenerate_invite_${groupId}`)],
    [Markup.button.callback('« Назад к группе', `group_${groupId}`)],
  ])
);
*/

/**
 * Обработчик обновления invite code
 */
/*
this.bot.action(/regenerate_invite_(\d+)/, async (ctx) => {
  const groupId = parseInt(ctx.match[1]);
  const user = await this.userService.getUserByTelegramId(ctx.from!.id);
  
  if (!user) return;

  const isAdmin = await this.groupService.isUserAdmin(user.id, groupId);
  if (!isAdmin) {
    await ctx.answerCbQuery('⛔ Только администраторы могут обновлять код');
    return;
  }

  const newCode = generateInviteCode();
  await this.groupService.updateInviteCode(groupId, newCode);
  
  await ctx.answerCbQuery('✅ Код приглашения обновлен');
  
  // Refresh management menu
  const group = await this.groupService.getGroupById(groupId);
  await ctx.editMessageText(
    `⚙️ Управление группой "${group.name}"\n\n` +
    `Новый код: \`${newCode}\`\n/register ${newCode}\n\n` +
    `Выберите действие:`,
    Markup.inlineKeyboard([
      [Markup.button.callback('👥 Управление участниками', `manage_members_${groupId}`)],
      [Markup.button.callback('🔗 Обновить код приглашения', `regenerate_invite_${groupId}`)],
      [Markup.button.callback('« Назад к группе', `group_${groupId}`)],
    ])
  );
});
*/

// =====================================================
// PRIVATE MESSAGE (ЛС) GROUP MANAGEMENT
// =====================================================

/**
 * Команда /creategroup - создание внутренней группы через ЛС
 */
/*
this.bot.command('creategroup', async (ctx) => {
  await ctx.reply(
    'Введите название новой группы:\n\n' +
    'Например: "Футбол по пятницам" или "Волейбол Центральный"\n\n' +
    '(Функция создания группы будет реализована в следующей версии)'
  );
});
*/

/**
 * Команда /mygroups - список групп пользователя с inline кнопками
 */
/*
this.bot.command('mygroups', async (ctx) => {
  const user = await this.userService.getUserByTelegramId(ctx.from!.id);
  if (!user) return;

  const groups = await this.groupService.getUserGroups(user.id);

  if (groups.length === 0) {
    await ctx.reply(
      'У вас пока нет групп.\n\nСоздайте новую: /creategroup'
    );
    return;
  }

  const keyboard = groups.map((group) => [
    Markup.button.callback(
      `${group.name} (${group.members?.length || 0} чел.)`,
      `group_${group.id}`
    ),
  ]);

  await ctx.reply(
    `👥 Ваши группы (${groups.length}):\n\nВыберите группу:`,
    Markup.inlineKeyboard(keyboard)
  );
});
*/

/**
 * Обработчик нажатия на группу - детальное меню группы
 */
/*
this.bot.action(/group_(\d+)/, async (ctx) => {
  const groupId = parseInt(ctx.match[1]);
  const group = await this.groupService.getGroupById(groupId);
  
  if (!group) {
    await ctx.answerCbQuery('Группа не найдена');
    return;
  }

  const user = await this.userService.getUserByTelegramId(ctx.from!.id);
  const isAdmin = user ? await this.groupService.isUserAdmin(user.id, groupId) : false;

  const games = await this.gameService.getUpcomingGroupGames(groupId);
  const gamesText = games.length > 0 
    ? `\n\n🎮 Предстоящие игры: ${games.length}`
    : '\n\n📭 Пока нет запланированных игр';

  const keyboard = [
    [Markup.button.callback('🎮 Игры группы', `games_${groupId}`)],
    [Markup.button.callback('👥 Участники', `members_${groupId}`)],
  ];

  if (isAdmin) {
    keyboard.push([Markup.button.callback('➕ Создать игру', `create_game_${groupId}`)]);
    keyboard.push([Markup.button.callback('⚙️ Управление', `manage_${groupId}`)]);
  }

  keyboard.push([
    Markup.button.callback('👋 Покинуть группу', `leave_group_${groupId}`),
  ]);
  keyboard.push([Markup.button.callback('« Назад', 'my_groups')]);

  await ctx.editMessageText(
    `📁 ${group.name}\n` +
    `${group.description || ''}\n` +
    `👥 Участников: ${group.members?.length || 0}` +
    gamesText,
    Markup.inlineKeyboard(keyboard)
  );
  await ctx.answerCbQuery();
});
*/

/**
 * Возврат к списку групп
 */
/*
this.bot.action('my_groups', async (ctx) => {
  const user = await this.userService.getUserByTelegramId(ctx.from!.id);
  if (!user) return;

  const groups = await this.groupService.getUserGroups(user.id);
  const keyboard = groups.map((group) => [
    Markup.button.callback(
      `${group.name} (${group.members?.length || 0} чел.)`,
      `group_${group.id}`
    ),
  ]);

  await ctx.editMessageText(
    `👥 Ваши группы (${groups.length}):\n\nВыберите группу:`,
    Markup.inlineKeyboard(keyboard)
  );
  await ctx.answerCbQuery();
});
*/

/**
 * Выход из группы
 */
/*
this.bot.action(/leave_group_(\d+)/, async (ctx) => {
  const groupId = parseInt(ctx.match[1]);
  const user = await this.userService.getUserByTelegramId(ctx.from!.id);
  
  if (!user) {
    await ctx.answerCbQuery('Ошибка: пользователь не найден');
    return;
  }

  const group = await this.groupService.getGroupById(groupId);
  if (!group) {
    await ctx.answerCbQuery('Группа не найдена');
    return;
  }

  await this.groupService.removeMemberFromGroup(user.id, groupId);
  
  await ctx.editMessageText(
    `Вы покинули группу "${group.name}" 👋\n\n` +
    `Используйте /mygroups чтобы увидеть оставшиеся группы`
  );
  await ctx.answerCbQuery('Вы вышли из группы');
});
*/

// =====================================================
// ДОПОЛНИТЕЛЬНЫЕ МЕТОДЫ GroupService
// =====================================================

/**
 * Метод для обновления invite code группы
 */
/*
async updateInviteCode(groupId: number, newCode: string): Promise<void> {
  const groupRepo = this.db.getRepository(Group);
  await groupRepo.update(groupId, { invite_code: newCode });
}
*/

/**
 * Создание группы через ЛС (не привязанной к Telegram группе)
 */
/*
async createGroup(name: string, creatorId: number, isPrivate: boolean = false): Promise<Group> {
  const groupRepo = this.db.getRepository(Group);
  const memberRepo = this.db.getRepository(GroupMember);

  const group = groupRepo.create({
    name,
    creator_id: creatorId,
    is_private: isPrivate,
    invite_code: isPrivate ? generateInviteCode() : undefined,
    telegram_chat_id: null, // Не привязана к реальной Telegram группе
  });

  await groupRepo.save(group);

  // Add creator as admin
  const member = memberRepo.create({
    user_id: creatorId,
    group_id: group.id,
    role: GroupRole.ADMIN,
  });
  await memberRepo.save(member);

  console.log(`Group created: ${group.name} by user ${creatorId}`);
  return group;
}
*/

// =====================================================
// ПРИМЕЧАНИЯ
// =====================================================

/*
КОГДА МОЖЕТ ПРИГОДИТЬСЯ:

1. INVITE CODE:
   - Для приватных групп, где нужен контроль доступа
   - Для временных команд/турниров
   - Для платных мероприятий

2. ЛС УПРАВЛЕНИЕ:
   - Персональный дашборд пользователя
   - Просмотр всех своих игр из разных групп
   - Управление уведомлениями
   - Статистика по всем группам

3. ВНУТРЕННИЕ ГРУППЫ (не Telegram):
   - Кросс-платформенные команды
   - Виртуальные лиги
   - Рейтинговые системы

ИНТЕГРАЦИЯ:
- Можно комбинировать: реальные Telegram группы + виртуальные команды внутри них
- Пример: Telegram группа "Футбол район", внутри неё виртуальные команды "Красные", "Синие"
*/
