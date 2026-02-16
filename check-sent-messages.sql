-- =========================================================
-- Verificar mensajes ENVIADOS en messages_new
-- =========================================================

-- 1. CONTAR MENSAJES POR TIPO DE REMITENTE
SELECT 
    sender_type,
    COUNT(*) as total_mensajes,
    COUNT(DISTINCT conversation_id) as conversaciones,
    MAX(created_at) as ultimo_mensaje
FROM messages_new
GROUP BY sender_type
ORDER BY total_mensajes DESC;

-- 2. MENSAJES ENVIADOS (últimos 50)
-- Los mensajes enviados tienen sender_type = 'you' o 'ia'
SELECT 
    m.id,
    m.conversation_id,
    c.contact_name,
    c.external_id as whatsapp_jid,
    m.sender_type,
    m.message_type,
    LEFT(m.text_content, 150) as mensaje_preview,
    m.created_at,
    m.whatsapp_created_at,
    m.last_msg_id,
    m.user_id
FROM messages_new m
LEFT JOIN conversations_new c ON m.conversation_id = c.id
WHERE m.sender_type IN ('you', 'ia')  -- Mensajes enviados por el usuario o IA
ORDER BY m.created_at DESC
LIMIT 50;

-- 3. COMPARAR MENSAJES ENVIADOS VS RECIBIDOS
SELECT 
    CASE 
        WHEN sender_type IN ('you', 'ia') THEN 'Enviados'
        WHEN sender_type = 'user' THEN 'Recibidos'
        ELSE 'Otros'
    END as tipo,
    COUNT(*) as cantidad,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as porcentaje
FROM messages_new
GROUP BY 
    CASE 
        WHEN sender_type IN ('you', 'ia') THEN 'Enviados'
        WHEN sender_type = 'user' THEN 'Recibidos'
        ELSE 'Otros'
    END
ORDER BY cantidad DESC;

-- 4. MENSAJES ENVIADOS POR CONVERSACIÓN (top 20)
SELECT 
    c.contact_name,
    c.external_id as whatsapp_jid,
    COUNT(CASE WHEN m.sender_type IN ('you', 'ia') THEN 1 END) as mensajes_enviados,
    COUNT(CASE WHEN m.sender_type = 'user' THEN 1 END) as mensajes_recibidos,
    COUNT(*) as total_mensajes,
    MAX(m.created_at) as ultimo_mensaje
FROM conversations_new c
INNER JOIN messages_new m ON c.id = m.conversation_id
GROUP BY c.id, c.contact_name, c.external_id
HAVING COUNT(CASE WHEN m.sender_type IN ('you', 'ia') THEN 1 END) > 0
ORDER BY mensajes_enviados DESC
LIMIT 20;

-- 5. MENSAJES ENVIADOS HOY
SELECT 
    COUNT(*) as mensajes_enviados_hoy,
    COUNT(DISTINCT conversation_id) as conversaciones,
    COUNT(DISTINCT user_id) as usuarios
FROM messages_new
WHERE sender_type IN ('you', 'ia')
  AND DATE(created_at) = CURRENT_DATE;

-- 6. MENSAJES ENVIADOS ÚLTIMAS 24 HORAS
SELECT 
    COUNT(*) as mensajes_enviados_24h,
    COUNT(DISTINCT conversation_id) as conversaciones,
    MIN(created_at) as primer_mensaje,
    MAX(created_at) as ultimo_mensaje
FROM messages_new
WHERE sender_type IN ('you', 'ia')
  AND created_at >= NOW() - INTERVAL '24 hours';

-- 7. VERIFICAR SI HAY MENSAJES ENVIADOS SIN last_msg_id
SELECT 
    COUNT(*) as mensajes_sin_last_msg_id,
    COUNT(*) * 100.0 / NULLIF(SUM(COUNT(*)) OVER (), 0) as porcentaje
FROM messages_new
WHERE sender_type IN ('you', 'ia')
  AND last_msg_id IS NULL;

-- 8. MENSAJES ENVIADOS POR IA VS USUARIO
SELECT 
    sender_type,
    COUNT(*) as cantidad,
    COUNT(DISTINCT conversation_id) as conversaciones,
    MAX(created_at) as ultimo_mensaje
FROM messages_new
WHERE sender_type IN ('you', 'ia')
GROUP BY sender_type
ORDER BY cantidad DESC;

-- 9. CONVERSACIONES SIN MENSAJES ENVIADOS (solo recibidos)
SELECT 
    c.contact_name,
    c.external_id as whatsapp_jid,
    COUNT(m.id) as total_mensajes,
    COUNT(CASE WHEN m.sender_type = 'user' THEN 1 END) as mensajes_recibidos,
    COUNT(CASE WHEN m.sender_type IN ('you', 'ia') THEN 1 END) as mensajes_enviados,
    MAX(m.created_at) as ultimo_mensaje
FROM conversations_new c
INNER JOIN messages_new m ON c.id = m.conversation_id
GROUP BY c.id, c.contact_name, c.external_id
HAVING COUNT(CASE WHEN m.sender_type IN ('you', 'ia') THEN 1 END) = 0
ORDER BY total_mensajes DESC
LIMIT 20;

-- 10. RESUMEN GENERAL
SELECT 
    'Total mensajes' as categoria,
    COUNT(*)::text as valor
FROM messages_new
UNION ALL
SELECT 
    'Mensajes enviados (you + ia)',
    COUNT(*)::text
FROM messages_new
WHERE sender_type IN ('you', 'ia')
UNION ALL
SELECT 
    'Mensajes recibidos (user)',
    COUNT(*)::text
FROM messages_new
WHERE sender_type = 'user'
UNION ALL
SELECT 
    'Mensajes enviados hoy',
    COUNT(*)::text
FROM messages_new
WHERE sender_type IN ('you', 'ia')
  AND DATE(created_at) = CURRENT_DATE
UNION ALL
SELECT 
    'Mensajes recibidos hoy',
    COUNT(*)::text
FROM messages_new
WHERE sender_type = 'user'
  AND DATE(created_at) = CURRENT_DATE;

