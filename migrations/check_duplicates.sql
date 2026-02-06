-- Проверка: найти дубликаты участников в базе данных
SELECT 
    game_id, 
    user_id, 
    COUNT(*) as duplicates,
    array_agg(id ORDER BY joined_at) as ids,
    array_agg(participation_status) as statuses
FROM game_participants
GROUP BY game_id, user_id
HAVING COUNT(*) > 1
ORDER BY duplicates DESC;
