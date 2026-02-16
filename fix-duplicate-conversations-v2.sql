-- =========================================================
-- Identificar y consolidar conversaciones duplicadas (VERSIÓN CORREGIDA)
-- =========================================================

-- 1. IDENTIFICAR CONVERSACIONES DUPLICADAS
-- Muestra todas las conversaciones que tienen el mismo external_id (JID)
SELECT 
    external_id,
    user_id,
    COUNT(*) as cantidad_duplicados,
    STRING_AGG(id::text, ', ') as conversation_ids,
    STRING_AGG(contact_name, ' | ') as nombres,
    STRING_AGG(wa_user_id, ' | ') as wa_user_ids
FROM conversations_new
GROUP BY external_id, user_id
HAVING COUNT(*) > 1
ORDER BY cantidad_duplicados DESC;

-- 2. VER DETALLES DE LAS CONVERSACIONES DUPLICADAS
-- Para un JID específico (ejemplo: 34636029139@s.whatsapp.net)
SELECT 
    c.id as conversation_id,
    c.external_id,
    c.contact_name,
    c.wa_user_id,
    c.started_at,
    c.updated_at,
    COUNT(m.id) as total_mensajes,
    MAX(m.created_at) as ultimo_mensaje
FROM conversations_new c
LEFT JOIN messages_new m ON c.id = m.conversation_id
WHERE c.external_id = '34636029139@s.whatsapp.net'  -- Cambiar por el JID que quieras revisar
GROUP BY c.id, c.external_id, c.contact_name, c.wa_user_id, c.started_at, c.updated_at
ORDER BY ultimo_mensaje DESC NULLS LAST;

-- 3. CONSOLIDAR CONVERSACIONES DUPLICADAS (VERSIÓN SIMPLIFICADA)
-- IMPORTANTE: Ejecutar esto con cuidado, hacer backup primero
DO $$
DECLARE
    dup_record RECORD;
    main_conv_id UUID;
    dup_conv_id UUID;
    msg_count INTEGER;
BEGIN
    -- Para cada grupo de conversaciones duplicadas
    FOR dup_record IN 
        SELECT DISTINCT
            external_id,
            user_id
        FROM conversations_new
        GROUP BY external_id, user_id
        HAVING COUNT(*) > 1
    LOOP
        -- Seleccionar la conversación principal (la más reciente por updated_at)
        -- Simplificamos para evitar problemas de tipo con subconsultas en ORDER BY
        SELECT id INTO main_conv_id
        FROM conversations_new
        WHERE external_id = dup_record.external_id
          AND user_id = dup_record.user_id
        ORDER BY updated_at DESC NULLS LAST, id DESC
        LIMIT 1;
        
        IF main_conv_id IS NULL THEN
            RAISE NOTICE 'No se encontró conversación principal para %', dup_record.external_id;
            CONTINUE;
        END IF;
        
        RAISE NOTICE 'Consolidando conversaciones para % (user_id: %) - Conversación principal: %', 
            dup_record.external_id, dup_record.user_id, main_conv_id;
        
        -- Mover mensajes de todas las conversaciones duplicadas a la principal
        FOR dup_conv_id IN 
            SELECT c.id
            FROM conversations_new c
            WHERE c.external_id = dup_record.external_id
              AND c.user_id = dup_record.user_id
              AND c.id != main_conv_id
        LOOP
            -- Contar mensajes a mover
            SELECT COUNT(*) INTO msg_count
            FROM messages_new
            WHERE conversation_id = dup_conv_id;
            
            -- Mover mensajes
            UPDATE messages_new
            SET conversation_id = main_conv_id
            WHERE conversation_id = dup_conv_id;
            
            RAISE NOTICE '  Movidos % mensajes de conversación % a %', 
                msg_count, dup_conv_id, main_conv_id;
            
            -- Actualizar la conversación principal con datos de la duplicada si son mejores
            UPDATE conversations_new
            SET 
                contact_name = COALESCE(
                    NULLIF((SELECT contact_name FROM conversations_new WHERE id = dup_conv_id), ''),
                    contact_name
                ),
                contact_photo_url = COALESCE(
                    NULLIF((SELECT contact_photo_url FROM conversations_new WHERE id = dup_conv_id), ''),
                    contact_photo_url
                ),
                updated_at = GREATEST(
                    updated_at, 
                    (SELECT updated_at FROM conversations_new WHERE id = dup_conv_id)
                )
            WHERE id = main_conv_id;
            
            -- Eliminar la conversación duplicada
            DELETE FROM conversations_new WHERE id = dup_conv_id;
            
            RAISE NOTICE '  Eliminada conversación duplicada: %', dup_conv_id;
        END LOOP;
    END LOOP;
    
    RAISE NOTICE 'Consolidación completada';
END $$;

-- 4. VERIFICAR RESULTADO DESPUÉS DE LA CONSOLIDACIÓN
-- Verificar si quedan duplicados
SELECT 
    external_id,
    user_id,
    COUNT(*) as cantidad_conversaciones
FROM conversations_new
GROUP BY external_id, user_id
HAVING COUNT(*) > 1
ORDER BY cantidad_conversaciones DESC;

-- 5. RESUMEN DE MENSAJES POR CONVERSACIÓN (después de consolidar)
SELECT 
    c.contact_name,
    c.external_id as whatsapp_jid,
    COUNT(m.id) as total_mensajes,
    MAX(m.created_at) as ultimo_mensaje
FROM conversations_new c
INNER JOIN messages_new m ON c.id = m.conversation_id
GROUP BY c.id, c.contact_name, c.external_id
ORDER BY total_mensajes DESC
LIMIT 20;

