-- =========================================================
-- Identificar y consolidar conversaciones duplicadas (VERSIÓN CON VALIDACIÓN)
-- =========================================================

-- 1. IDENTIFICAR CONVERSACIONES DUPLICADAS
SELECT 
    external_id,
    user_id,
    COUNT(*) as cantidad_duplicados,
    STRING_AGG(id::text, ', ') as conversation_ids
FROM conversations_new
WHERE user_id IS NOT NULL 
  AND external_id IS NOT NULL
GROUP BY external_id, user_id
HAVING COUNT(*) > 1
ORDER BY cantidad_duplicados DESC;

-- 2. VERIFICAR TIPOS DE DATOS (para debug)
SELECT 
    'user_id inválido' as problema,
    COUNT(*) as cantidad
FROM conversations_new
WHERE user_id IS NOT NULL 
  AND user_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
UNION ALL
SELECT 
    'external_id nulo' as problema,
    COUNT(*) as cantidad
FROM conversations_new
WHERE external_id IS NULL;

-- 3. CONSOLIDAR CONVERSACIONES DUPLICADAS (VERSIÓN CON VALIDACIÓN)
DO $$
DECLARE
    dup_record RECORD;
    main_conv_id UUID;
    dup_conv_id UUID;
    msg_count INTEGER;
    processed_count INTEGER := 0;
BEGIN
    -- Para cada grupo de conversaciones duplicadas
    FOR dup_record IN 
        SELECT DISTINCT
            external_id,
            user_id
        FROM conversations_new
        WHERE user_id IS NOT NULL 
          AND external_id IS NOT NULL
          AND user_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'  -- Validar formato UUID
        GROUP BY external_id, user_id
        HAVING COUNT(*) > 1
    LOOP
        BEGIN
            -- Seleccionar la conversación principal (la más reciente por updated_at)
            SELECT id INTO main_conv_id
            FROM conversations_new
            WHERE external_id = dup_record.external_id
              AND user_id = dup_record.user_id::uuid  -- Asegurar conversión explícita a UUID
            ORDER BY updated_at DESC NULLS LAST, id DESC
            LIMIT 1;
            
            IF main_conv_id IS NULL THEN
                RAISE NOTICE 'No se encontró conversación principal para % (user_id: %)', 
                    dup_record.external_id, dup_record.user_id;
                CONTINUE;
            END IF;
            
            RAISE NOTICE 'Consolidando conversaciones para % (user_id: %) - Conversación principal: %', 
                dup_record.external_id, dup_record.user_id, main_conv_id;
            
            -- Mover mensajes de todas las conversaciones duplicadas a la principal
            FOR dup_conv_id IN 
                SELECT c.id
                FROM conversations_new c
                WHERE c.external_id = dup_record.external_id
                  AND c.user_id = dup_record.user_id::uuid  -- Asegurar conversión explícita a UUID
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
            
            processed_count := processed_count + 1;
            
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE 'Error procesando % (user_id: %): %', 
                    dup_record.external_id, dup_record.user_id, SQLERRM;
                CONTINUE;
        END;
    END LOOP;
    
    RAISE NOTICE 'Consolidación completada. Procesados % grupos de duplicados', processed_count;
END $$;

-- 4. VERIFICAR RESULTADO DESPUÉS DE LA CONSOLIDACIÓN
SELECT 
    external_id,
    user_id,
    COUNT(*) as cantidad_conversaciones
FROM conversations_new
WHERE user_id IS NOT NULL 
  AND external_id IS NOT NULL
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

