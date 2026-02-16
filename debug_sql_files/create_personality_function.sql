-- Función para crear personalidades evitando el trigger problemático
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
BEGIN
  -- Insertar directamente con SQL, evitando triggers problemáticos
  INSERT INTO personalities (
    users_id,
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
  
  -- Obtener los datos completos de la personalidad recién creada
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
    RAISE EXCEPTION 'Error creating personality: %', SQLERRM;
END;
$$; 