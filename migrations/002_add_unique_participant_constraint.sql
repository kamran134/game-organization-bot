-- Миграция: добавление уникального индекса для предотвращения дублирования участников
-- Дата: 2026-02-06
-- Цель: Один пользователь может быть записан на игру только один раз

-- Удаляем возможные дубликаты (оставляем самую старую запись для каждой пары game_id + user_id)
DELETE FROM game_participants
WHERE id NOT IN (
    SELECT MIN(id)
    FROM game_participants
    GROUP BY game_id, user_id
);

-- Добавляем уникальный индекс на пару (game_id, user_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_game_participants_unique 
ON game_participants (game_id, user_id);

-- Альтернативный вариант с использованием UNIQUE CONSTRAINT
-- ALTER TABLE game_participants 
-- ADD CONSTRAINT uq_game_participant UNIQUE (game_id, user_id);
