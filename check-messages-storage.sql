-- =========================================================
-- Verificar si se están guardando mensajes en messages_new
-- =========================================================

-- 1. Contar total de mensajes
SELECT 
    COUNT(*) as total_mensajes,
    COUNT(DISTINCT conversation_id) as total_conversaciones,
    COUNT(DISTINCT user_id) as total_usuarios
FROM messages_new;

-- 2. Mensajes más recientes (últimos 20)
SELECT 
    m.id,
    m.conversation_id,
    c.contact_name,
    c.external_id as whatsapp_jid,
    m.sender_type,
    m.message_type,
    LEFT(m.text_content, 100) as mensaje_preview,
    m.created_at,
    m.whatsapp_created_at,
    m.last_msg_id,
    m.user_id
FROM messages_new m
LEFT JOIN conversations_new c ON m.conversation_id = c.id
ORDER BY m.created_at DESC
LIMIT 20;

-- 3. Mensajes por tipo de remitente
SELECT 
    sender_type,
    COUNT(*) as cantidad,
    MAX(created_at) as ultimo_mensaje
FROM messages_new
GROUP BY sender_type
ORDER BY cantidad DESC;

-- 4. Mensajes por tipo de mensaje
SELECT 
    message_type,
    COUNT(*) as cantidad
FROM messages_new
GROUP BY message_type
ORDER BY cantidad DESC;

-- 5. Mensajes por usuario (top 10)
SELECT 
    user_id,
    COUNT(*) as total_mensajes,
    COUNT(DISTINCT conversation_id) as conversaciones,
    MAX(created_at) as ultimo_mensaje
FROM messages_new
GROUP BY user_id
ORDER BY total_mensajes DESC
LIMIT 10;

-- 6. Mensajes de hoy
SELECT 
    COUNT(*) as mensajes_hoy,
    COUNT(DISTINCT conversation_id) as conversaciones_hoy,
    COUNT(DISTINCT user_id) as usuarios_hoy
FROM messages_new
WHERE DATE(created_at) = CURRENT_DATE;

-- 7. Mensajes de las últimas 24 horas
SELECT 
    COUNT(*) as mensajes_ultimas_24h,
    COUNT(DISTINCT conversation_id) as conversaciones_ultimas_24h
FROM messages_new
WHERE created_at >= NOW() - INTERVAL '24 hours';

-- 8. Verificar si hay mensajes con last_msg_id (para evitar duplicados)
SELECT 
    COUNT(*) as total_mensajes,
    COUNT(last_msg_id) as mensajes_con_last_msg_id,
    COUNT(*) - COUNT(last_msg_id) as mensajes_sin_last_msg_id
FROM messages_new;

-- 9. Verificar mensajes duplicados por last_msg_id
SELECT 
    last_msg_id,
    conversation_id,
    COUNT(*) as cantidad_duplicados
FROM messages_new
WHERE last_msg_id IS NOT NULL
GROUP BY last_msg_id, conversation_id
HAVING COUNT(*) > 1
ORDER BY cantidad_duplicados DESC
LIMIT 10;

-- 10. Mensajes por conversación (top 10 conversaciones con más mensajes)
SELECT 
    c.contact_name,
    c.external_id as whatsapp_jid,
    COUNT(m.id) as total_mensajes,
    MAX(m.created_at) as ultimo_mensaje
FROM conversations_new c
INNER JOIN messages_new m ON c.id = m.conversation_id
GROUP BY c.id, c.contact_name, c.external_id
ORDER BY total_mensajes DESC
LIMIT 10;

