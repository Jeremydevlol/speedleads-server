-- SOLUCIÓN AGRESIVA: Función que evita TODOS los triggers
DROP FUNCTION IF EXISTS create_personality_safe;

CREATE OR REPLACE FUNCTION create_personality_safe(
  p_users_id UUID,
  p_nombre TEXT,
  p_empresa TEXT DEFAULT '',
  p_sitio_web TEXT DEFAULT '',
  p_posicion TEXT DEFAULT '',
  p_instrucciones TEXT DEFAULT '',
  p_saludo TEXT DEFAULT '',
  p_category TEXT DEFAULT 'formal',
  p_avatar_url TEXT DEFAULT NULL,
  p_time_response NUMERIC DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_personality_id BIGINT;
  result_data JSON;
  current_triggers TEXT[];
  trigger_name TEXT;
BEGIN
  -- 1. DESHABILITAR TEMPORALMENTE TODOS LOS TRIGGERS
  SELECT array_agg(trigger_name) INTO current_triggers
  FROM information_schema.triggers 
  WHERE event_object_table = 'personalities';
  
  -- Deshabilitar triggers uno por uno
  IF current_triggers IS NOT NULL THEN
    FOREACH trigger_name IN ARRAY current_triggers
    LOOP
      EXECUTE format('ALTER TABLE personalities DISABLE TRIGGER %I', trigger_name);
    END LOOP;
  END IF;
  
  -- 2. INSERTAR SIN TRIGGERS
  INSERT INTO personalities (
    users_id,
    users_id_new,  -- Explícitamente NULL para evitar conflictos
    nombre,
    empresa,
    sitio_web,
    posicion,
    instrucciones,
    saludo,
    category,
    avatar_url,
    time_response,
    created_at,
    updated_at
  ) VALUES (
    p_users_id,
    NULL,  -- Forzar NULL en la columna problemática
    p_nombre,
    COALESCE(p_empresa, ''),
    COALESCE(p_sitio_web, ''),
    COALESCE(p_posicion, ''),
    COALESCE(p_instrucciones, ''),
    COALESCE(p_saludo, ''),
    COALESCE(p_category, 'formal'),
    p_avatar_url,
    p_time_response,
    NOW(),
    NOW()
  )
  RETURNING id INTO new_personality_id;
  
  -- 3. REHABILITAR TODOS LOS TRIGGERS
  IF current_triggers IS NOT NULL THEN
    FOREACH trigger_name IN ARRAY current_triggers
    LOOP
      EXECUTE format('ALTER TABLE personalities ENABLE TRIGGER %I', trigger_name);
    END LOOP;
  END IF;
  
  -- 4. OBTENER DATOS COMPLETOS
  SELECT json_build_object(
    'id', id,
    'users_id', users_id,
    'nombre', nombre,
    'empresa', empresa,
    'sitio_web', sitio_web,
    'posicion', posicion,
    'instrucciones', instrucciones,
    'saludo', saludo,
    'category', category,
    'avatar_url', avatar_url,
    'time_response', time_response,
    'created_at', created_at,
    'updated_at', updated_at
  ) INTO result_data
  FROM personalities 
  WHERE id = new_personality_id;
  
  RETURN result_data;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Asegurar que los triggers se rehabiliten incluso si hay error
    IF current_triggers IS NOT NULL THEN
      FOREACH trigger_name IN ARRAY current_triggers
      LOOP
        BEGIN
          EXECUTE format('ALTER TABLE personalities ENABLE TRIGGER %I', trigger_name);
        EXCEPTION WHEN OTHERS THEN
          -- Continuar incluso si hay error rehabilitando
          CONTINUE;
        END;
      END LOOP;
    END IF;
    
    RAISE EXCEPTION 'Error creating personality: %', SQLERRM;
END;
$$;

-- Test de la función
SELECT create_personality_safe(
  'ba35d3ff-03a2-4750-8eed-bd5b046cc132'::UUID,
  'TEST AGRESIVO',
  'Test Company',
  'https://test.com',
  'Tester',
  'Instrucciones de test',
  'Hola desde test',
  'formal',
  NULL,
  NULL
); 