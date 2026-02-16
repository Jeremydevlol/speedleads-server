import sgMail from '@sendgrid/mail';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid'; // Para generar contraseñas aleatorias
import pool, { getUserById, supabaseAdmin } from '../config/db.js';

dotenv.config();

const supabaseUrl = 'https://jnzsabhbfnivdiceoefg.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseKey) {
  throw new Error('Supabase service role key is not defined');
}
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: false,    // ← Cambiado de true a false
    detectSessionInUrl: false, // ← Cambiado de true a false
  },
});

const JWT_SECRET = process.env.JWT_SECRET || 'clave-secreta-de-desarrollo';
const sendgridKey = process.env.SENDGRID_API_KEY;
const sendgridTemplateId = process.env.SENDGRID_INVITE_TEMPLATE_ID;
const sendgridFrom = process.env.SENDGRID_FROM_EMAIL;
sgMail.setApiKey(sendgridKey);

/**
 * Extrae y verifica el token JWT enviado en Authorization: Bearer ... o en cookies
 * Devuelve el userId o sub (string) si es válido, o null si no lo es.
 */
function getUserIdFromToken(req) {
  // Buscar token en headers Authorization
  let token = null;
  const authHeader = req.headers['authorization'];
  
  if (authHeader) {
    token = authHeader.split(' ')[1];
  }
  
  // Si no hay token en headers, buscar en cookies
  if (!token && req.cookies && req.cookies.auth_token) {
    token = req.cookies.auth_token;
    console.log('🍪 Token obtenido de cookie en getUserIdFromToken');
  }
  
  if (!token) {
    // En desarrollo, usar x-user-id (frontend envía sesión Supabase en admin/dashboard)
    const xUserId = (req.headers['x-user-id'] || '').trim();
    if (process.env.NODE_ENV === 'development' && xUserId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(xUserId)) {
      return xUserId;
    }
    console.error('Token no proporcionado ni en Authorization header ni en cookies');
    return null;
  }

  const forceLogin = process.env.FORCE_LOGIN === 'true';

  // Con FORCE_LOGIN: solo decodificar (sin verificar firma) para evitar throws y stack traces
  if (forceLogin) {
    const decoded = jwt.decode(token);
    if (decoded && (decoded.userId || decoded.sub)) {
      return decoded.userId || decoded.sub;
    }
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const id = typeof payload.userId === 'string'
      ? payload.userId
      : typeof payload.sub === 'string'
        ? payload.sub
        : null;

    if (!id) {
      throw new Error('Token inválido, falta userId o sub en payload');
    }
    return id;
  } catch (err) {
    console.error('Error al verificar el token:', err.message);
    // En desarrollo, fallback a x-user-id para admin/dashboard
    const xUserId = (req.headers['x-user-id'] || '').trim();
    if (process.env.NODE_ENV === 'development' && xUserId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(xUserId)) {
      return xUserId;
    }
    return null;
  }
}

/**
 * Registro de usuario: guarda en DB y firma JWT con userId en el payload.
 */
async function register(req, res) {
  console.log(res)
  try {
    const { nombre, username, email, password, role = 'user' } = req;
    console.log("REQ EN REGISTER", req)
    if (!nombre || !username || !email || !password) {
      return res.status(400).json({ message: 'Faltan datos obligatorios.' });
    }

    // Verificamos duplicados
    const { rows: existing } = await pool.query(
      `SELECT id FROM users WHERE email = $1 OR username = $2 LIMIT 1`,
      [email, username]
    );
    if (existing.length > 0) {
      return res.status(400).json({ message: 'El email o username ya está en uso.' });
    }

    // Hasheamos contraseña
    const passwordHash = await bcrypt.hash(password, 10);

    // Insertamos usuario
    const { rows: newUser } = await pool.query(
      `INSERT INTO users
         (full_name, username, email, password_hash, role, avatar_url, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NULL, NOW(), NOW())
       RETURNING id, email, username, role, full_name, avatar_url`,
      [nombre, username, email, passwordHash, role]
    );
    const user = newUser[0];

    // Firmamos JWT incluyendo userId
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    return res.json({
      message: 'Usuario registrado correctamente.',
      token,
      user,
    });
  } catch (error) {
    console.error('Error /api/register:', error);
    return res.status(500).json({ message: 'Error interno al registrar usuario.' });
  }
}

/**
 * Función que genera una contraseña aleatoria, registra al usuario, luego envía la invitación.
 * Recibe nombre, username y email del frontend.
 */
const inviteUserByEmail = async (req, res) => {
  try {
    const { email, nombre, username } = req.body;

    // Generación de contraseña aleatoria
    const password = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);

    // Verificación de duplicados
    const { rows: existing } = await pool.query(
      `SELECT id FROM users WHERE email = $1 OR username = $2 LIMIT 1`,
      [email, username]
    );
    if (existing.length > 0) {
      return res.status(400).json({ message: 'El email o username ya está en uso.' });
    }

    // Registro del usuario
    const { rows: newUser } = await pool.query(
      `INSERT INTO users (full_name, username, email, password_hash, role, avatar_url, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NULL, NOW(), NOW())
       RETURNING id, email, username, role, full_name, avatar_url`,
      [nombre, username, email, passwordHash, 'user']
    );
    const user = newUser[0];

    // Firmar el token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    const confirmationUrl = (process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://www.speedleads.app') + '/login';
    console.log(`📧 Enviando invitación a: ${email} con URL: ${confirmationUrl}`);
    
    // Comentado: URL anterior que usaba FRONTEND_URL
    // const confirmationUrl = `${process.env.FRONTEND_URL}/login`;

    const [response] = await sgMail.send({
      to: email,
      from: sendgridFrom,
      templateId: sendgridTemplateId, // reemplaza por el correcto
      dynamic_template_data: {
        Email: email,
        ConfirmationURL: confirmationUrl,
      },
    });

    console.log('✅ SendGrid statusCode:', response.statusCode);

    // Responder con los datos del usuario y el token
    return res.json({
      message: 'Usuario invitado y registrado correctamente.',
      user,
      token,
    });
  } catch (error) {
    console.error('❌ SendGrid error body:', error?.response?.body || error);
    console.error("Error al invitar al usuario:", error);
    return res.status(500).json({ message: "Error al invitar al usuario." });
  }
};


// Función para enviar el correo de invitación
async function sendInvitationEmail(email, password) {
  const invitationMessage = `Hola, tu cuenta ha sido creada con éxito. Puedes iniciar sesión con la siguiente contraseña temporal: ${password}`;

  // Aquí llamas al servicio de correo que uses, por ejemplo, nodemailer
  await sendEmail({
    to: email,
    subject: "Invitación a completar tu registro",
    text: invitationMessage,
  });
}

// Simulación de una función de envío de email (esto debería ser un servicio real)
async function sendEmail({ to, subject, text }) {
  // Aquí iría la lógica de envío de correo real, por ejemplo con nodemailer
  console.log(`Enviando correo a ${to} con el mensaje: ${text}`);
}

/**
 * Login de usuario: valida credenciales y firma JWT con userId.
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Faltan email o password.' });
    }

    const { rows: foundUsers } = await pool.query(
      `SELECT id, email, username, role, password_hash, avatar_url, full_name
         FROM users
        WHERE email = $1
        LIMIT 1`,
      [email]
    );
    if (foundUsers.length === 0) {
      return res.status(401).json({ message: 'Credenciales inválidas.' });
    }

    const user = foundUsers[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ message: 'Credenciales inválidas.' });
    }

    // Buscar subdominio del usuario en websites (solo si wildcards están habilitados)
    let userSubdomain = null;
    const enableWildcards = process.env.ENABLE_WILDCARD_SUBDOMAINS === 'true';
    
    if (enableWildcards) {
      try {
        const { rows: websites } = await pool.query(
          `SELECT slug FROM websites WHERE user_id = $1 AND is_published = true LIMIT 1`,
          [user.id]
        );
        if (websites.length > 0) {
          userSubdomain = websites[0].slug;
        }
      } catch (subdomainError) {
        console.warn('⚠️ Error obteniendo subdominio (no crítico):', subdomainError.message);
      }
    } else {
      console.log('🔒 Wildcards deshabilitados - omitiendo búsqueda de subdominio');
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    // Configurar cookie del token
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
      domain: process.env.NODE_ENV === 'development' ? undefined : (process.env.COOKIE_DOMAIN || '.speedleads.app'),
      path: '/'
    };

    console.log('🍪 Configurando cookies con opciones:', {
      domain: cookieOptions.domain,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
      nodeEnv: process.env.NODE_ENV,
      userSubdomain: userSubdomain,
      wildcardsEnabled: enableWildcards
    });

    res.cookie('auth_token', token, cookieOptions);
    res.cookie('user_id', user.id, cookieOptions);

    // Determinar redirección basada en el host actual y subdominio del usuario (solo si wildcards están habilitados)
    const currentHost = req.get('host');
    let redirectUrl = null;
    
    const appHost = process.env.FRONTEND_URL ? new URL(process.env.FRONTEND_URL).host : 'www.speedleads.app';
    if (currentHost !== appHost) {
      redirectUrl = (process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://www.speedleads.app') + '/dashboard';
    }
    /*
    if (enableWildcards && userSubdomain && currentHost === appHost) {
      redirectUrl = `https://${userSubdomain}.speedleads.io/dashboard`;
    } else if (enableWildcards && userSubdomain && currentHost.includes('.speedleads.io') && currentHost !== appHost) {
      const currentSubdomain = currentHost.split('.')[0];
      if (currentSubdomain !== userSubdomain) {
        redirectUrl = `https://${userSubdomain}.speedleads.io/dashboard`;
      }
    } else if (!enableWildcards) {
      if (currentHost !== appHost && currentHost.includes('.speedleads')) {
        redirectUrl = (process.env.FRONTEND_URL || 'https://www.speedleads.app') + '/dashboard';
      }
    }
    */

    return res.json({
      message: 'Inicio de sesión exitoso.',
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        avatar_url: user.avatar_url || '',
        full_name: user.full_name || '',
        subdomain: userSubdomain, // <- NUEVO: información del subdominio
      },
      redirect: redirectUrl // <- NUEVO: URL de redirección si aplica
    });
  } catch (error) {
    console.error('Error /api/login:', error);
    return res.status(500).json({ message: 'Error interno al iniciar sesión.' });
  }
}

/**
 * Obtener información del usuario autenticado.
 */
async function getUser(req, res) {
  try {
    const userId = getUserIdFromToken(req);
    if (!userId) {
      return res.status(401).json({ message: 'No autenticado' });
    }
    
    console.log('🔍 getUserId extraído:', userId);
    
    const { user } = await getUserById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    console.log('✅ Usuario encontrado en Supabase Auth:', user.email);
    
    // Intentar obtener perfil de profilesusers, pero sin bloquear el acceso si falla
    let username = '';
    let profileData = null;
    
    try {
      const { data: profileResult, error: profileError } = await supabaseAdmin
        .from('profilesusers')
        .select('username, avatar_url')
        .eq('user_id', userId)
        .single();
      
      if (profileError) {
        if (profileError.code === 'PGRST116') {
          // No se encontró perfil, intentar crear uno básico
          console.log(`⚠️ No se encontró perfil para usuario ${userId}, creando registro básico`);
          
          const defaultUsername = user.user_metadata?.username || 
                                  user.email?.split('@')[0] || 
                                  'user';
          
          try {
            const { data: newProfile, error: createError } = await supabaseAdmin
              .from('profilesusers')
              .insert({
                user_id: userId,
                username: defaultUsername,
                avatar_url: user.user_metadata?.avatar_url || null
              })
              .select('username, avatar_url')
              .single();
            
            if (createError) {
              console.error('⚠️ Error creando perfil básico (no crítico):', createError);
              // Usar datos del usuario de auth como fallback
              username = defaultUsername;
            } else {
              profileData = newProfile;
              username = newProfile.username;
              console.log('✅ Perfil básico creado exitosamente');
            }
          } catch (createErr) {
            console.error('⚠️ Error en catch al crear perfil (no crítico):', createErr);
            username = defaultUsername;
          }
        } else {
          console.error('⚠️ Error consultando profilesusers (no crítico):', profileError);
          // Usar datos del usuario de auth como fallback
          username = user.user_metadata?.username || user.email?.split('@')[0] || 'user';
        }
      } else {
        profileData = profileResult;
        username = profileResult.username;
        console.log('✅ Perfil encontrado en profilesusers');
      }
    } catch (profileErr) {
      console.error('⚠️ Error general con profilesusers (no crítico):', profileErr);
      // Usar datos del usuario de auth como fallback
      username = user.user_metadata?.username || user.email?.split('@')[0] || 'user';
    }

    // Preparar respuesta con todos los datos disponibles
    const userData = {
      id: user.id,
      email: user.email,
      username: username || '',
      full_name: user.user_metadata?.full_name || user.user_metadata?.name || '',
      role: user.role || 'user',
      avatar_url: profileData?.avatar_url || user.user_metadata?.avatar_url || '',
    };

    console.log('✅ Usuario cargado exitosamente:', {
      email: userData.email,
      username: userData.username,
      hasProfile: !!profileData
    });

    return res.json({
      user: userData,
    });
  } catch (err) {
    console.error('❌ Error crítico al obtener el usuario:', err);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
}

/**
 * Actualizar perfil del usuario
 */
async function updateProfile(req, res) {
  try {
    const userId = getUserIdFromToken(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'No autenticado' });
    }

    const { nombre, username, avatar_url, email } = req.body;
    let finalAvatarUrl = avatar_url;

    console.log(`📝 [updateProfile] Iniciando actualización para usuario: ${userId}`);
    console.log(`📋 [updateProfile] Datos recibidos:`, { 
      nombre, 
      username, 
      email, 
      hasAvatar: !!avatar_url,
      avatarType: avatar_url?.startsWith('data:') ? 'base64' : avatar_url ? 'url' : 'none'
    });

    // Obtener el usuario actual para preservar user_metadata existente
    const { user: currentUser } = await getUserById(userId);
    const currentMetadata = currentUser?.user_metadata || {};
    const currentAvatarUrl = currentMetadata?.avatar_url || currentUser?.user_metadata?.avatar_url;

    // Si recibimos base64, subimos a Supabase Storage
    if (avatar_url?.startsWith('data:image/')) {
      console.log(`📤 [updateProfile] Procesando avatar en base64...`);
      try {
        const [meta, data] = avatar_url.split(',');
        const fileExt = meta.split('/')[1].split(';')[0];
        const fileName = `avatars/${userId}/avatar-${Date.now()}.${fileExt}`;
        const fileBuffer = Buffer.from(data, 'base64');

        console.log(`📤 [updateProfile] Subiendo avatar a Supabase Storage: ${fileName} (${(fileBuffer.length / 1024).toFixed(2)}KB)`);

        const { error: uploadError } = await supabaseAdmin.storage
          .from('imagenesavatar')
          .upload(fileName, fileBuffer, {
            contentType: `image/${fileExt}`,
            upsert: true,
          });
        
        if (uploadError) {
          console.error('❌ [updateProfile] Error subiendo avatar:', uploadError);
          throw uploadError;
        }

        const { data: urlData } = supabaseAdmin.storage
          .from('imagenesavatar')
          .getPublicUrl(fileName);
        finalAvatarUrl = urlData.publicUrl;
        console.log(`✅ [updateProfile] Avatar subido exitosamente: ${finalAvatarUrl}`);
      } catch (avatarError) {
        console.error('❌ [updateProfile] Error procesando avatar base64:', avatarError);
        // Si falla el upload, mantener el avatar actual o usar el del request si es URL
        if (avatar_url && !avatar_url.startsWith('data:')) {
          finalAvatarUrl = avatar_url;
          console.log(`⚠️ [updateProfile] Usando avatar URL directa: ${finalAvatarUrl}`);
        } else {
          finalAvatarUrl = currentAvatarUrl;
          console.log(`⚠️ [updateProfile] Manteniendo avatar actual debido a error`);
        }
      }
    } else if (avatar_url && avatar_url.trim() !== '') {
      // Si recibimos una URL directa, usarla directamente
      finalAvatarUrl = avatar_url.trim();
      console.log(`✅ [updateProfile] Usando avatar URL directa: ${finalAvatarUrl}`);
    } else if (avatar_url === null || avatar_url === '') {
      // Si se envía null o string vacío, eliminar el avatar
      finalAvatarUrl = null;
      console.log(`🗑️ [updateProfile] Eliminando avatar del perfil`);
    } else {
      // Si no se proporciona avatar_url, mantener el actual
      finalAvatarUrl = currentAvatarUrl;
      console.log(`📋 [updateProfile] Manteniendo avatar actual: ${currentAvatarUrl || 'ninguno'}`);
    }

    // Preparar user_metadata preservando los campos existentes
    const updatedMetadata = {
      ...currentMetadata, // Preservar metadata existente
    };

    // Actualizar solo los campos que se proporcionan
    if (nombre !== undefined && nombre !== null && nombre.trim() !== '') {
      updatedMetadata.full_name = nombre.trim();
      console.log(`📝 [updateProfile] Agregando full_name a metadata: ${nombre.trim()}`);
    }
    if (username !== undefined) {
      // Permitir actualizar incluso si es null o string vacío (para limpiar)
      updatedMetadata.username = username !== null && username !== '' ? username.trim() : (username === null ? null : '');
      console.log(`📝 [updateProfile] Agregando username a metadata: ${updatedMetadata.username}`);
    }
    // Actualizar avatar_url si se proporciona (puede ser null para eliminarlo)
    if (avatar_url !== undefined) {
      updatedMetadata.avatar_url = finalAvatarUrl;
      if (finalAvatarUrl) {
        console.log(`📝 [updateProfile] Agregando avatar_url a metadata: ${finalAvatarUrl.substring(0, 50)}...`);
      } else {
        console.log(`📝 [updateProfile] Eliminando avatar_url de metadata`);
      }
    }

    console.log(`📋 [updateProfile] Metadata a guardar:`, {
      full_name: updatedMetadata.full_name,
      username: updatedMetadata.username,
      has_avatar: !!updatedMetadata.avatar_url,
      avatar_url: updatedMetadata.avatar_url ? `${updatedMetadata.avatar_url.substring(0, 50)}...` : null,
    });

    // Actualizar en auth.users
    const updatePayload = {
      user_metadata: updatedMetadata,
    };
    if (email) {
      updatePayload.email = email;
    }

    console.log(`🔄 [updateProfile] Actualizando auth.users...`);
    const { error: updateError, data: updatedUser } = await supabase.auth.admin.updateUserById(userId, updatePayload);
    
    if (updateError) {
      console.error('❌ [updateProfile] Error actualizando auth.users:', updateError);
      throw updateError;
    }
    
    console.log('✅ [updateProfile] Auth user actualizado exitosamente');
    console.log(`📋 [updateProfile] Metadata guardada en auth:`, updatedUser.user.user_metadata);

    // Verificar que el username se guardó en user_metadata
    if (username && !updatedUser.user.user_metadata?.username) {
      console.warn('⚠️ [updateProfile] Username no encontrado en user_metadata después de actualizar, reintentando...');
      // Reintentar solo el username
      const { error: retryError } = await supabase.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...updatedUser.user.user_metadata,
          username: username,
        },
      });
      if (retryError) {
        console.error('❌ [updateProfile] Error al reintentar guardar username:', retryError);
      } else {
        console.log('✅ [updateProfile] Username guardado correctamente en reintento');
      }
    }

    // Verificar que el avatar_url se guardó en user_metadata (si se proporcionó)
    if (avatar_url !== undefined) {
      const savedAvatarUrl = updatedUser.user.user_metadata?.avatar_url;
      const expectedAvatarUrl = finalAvatarUrl;
      
      // Comparar URLs (pueden tener parámetros diferentes pero ser la misma)
      const savedUrlBase = savedAvatarUrl?.split('?')[0];
      const expectedUrlBase = expectedAvatarUrl?.split('?')[0];
      
      if (savedUrlBase !== expectedUrlBase) {
        console.warn('⚠️ [updateProfile] Avatar URL no coincide en user_metadata después de actualizar, reintentando...');
        console.log(`📋 [updateProfile] Esperado: ${expectedUrlBase}, Guardado: ${savedUrlBase}`);
        // Reintentar solo el avatar_url
        const { error: retryError } = await supabase.auth.admin.updateUserById(userId, {
          user_metadata: {
            ...updatedUser.user.user_metadata,
            avatar_url: expectedAvatarUrl,
          },
        });
        if (retryError) {
          console.error('❌ [updateProfile] Error al reintentar guardar avatar_url:', retryError);
        } else {
          console.log('✅ [updateProfile] Avatar URL guardado correctamente en reintento');
        }
      } else {
        console.log('✅ [updateProfile] Avatar URL verificado en user_metadata');
      }
    }

    // Upsert en la tabla local profilesusers usando supabaseAdmin (actualización en tiempo real)
    // Siempre actualizar con los valores finales de user_metadata (que ya incluyen username y avatar_url)
    const finalUsernameForDb = updatedUser?.user?.user_metadata?.username || username || null;
    const finalAvatarForDb = updatedUser?.user?.user_metadata?.avatar_url || finalAvatarUrl || null;
    
    console.log('📋 [updateProfile] Valores para profilesusers:', {
      username_from_metadata: updatedUser?.user?.user_metadata?.username,
      username_final: finalUsernameForDb,
      avatar_from_metadata: updatedUser?.user?.user_metadata?.avatar_url ? `${updatedUser.user.user_metadata.avatar_url.substring(0, 50)}...` : null,
      avatar_final: finalAvatarForDb ? `${finalAvatarForDb.substring(0, 50)}...` : null
    });
    
    // Usar supabaseAdmin.upsert() para actualizar en tiempo real (como en googleAuth)
    const { data: profileData, error: profilesError } = await supabaseAdmin
      .from('profilesusers')
      .upsert({
        user_id: userId,
        username: finalUsernameForDb,
        avatar_url: finalAvatarForDb
      }, {
        onConflict: 'user_id'
      })
      .select('username, avatar_url')
      .single();
    
    if (profilesError) {
      console.error('❌ [updateProfile] Error actualizando profilesusers:', {
        message: profilesError.message,
        code: profilesError.code,
        detail: profilesError.detail,
        hint: profilesError.hint,
      });
    } else {
      console.log('✅ [updateProfile] Perfil actualizado en profilesusers en tiempo real', {
        username: profileData?.username,
        avatar_url: profileData?.avatar_url ? `${profileData.avatar_url.substring(0, 50)}...` : null
      });
    }

    // Obtener los datos actualizados directamente de la base de datos
    const { user: userFromDb } = await getUserById(userId);
    console.log(`📋 [updateProfile] Usuario desde BD:`, {
      email: userFromDb?.email,
      username_metadata: userFromDb?.user_metadata?.username,
      full_name_metadata: userFromDb?.user_metadata?.full_name,
      avatar_url_metadata: userFromDb?.user_metadata?.avatar_url ? `${userFromDb.user_metadata.avatar_url.substring(0, 50)}...` : null,
    });
    
    // Usar los datos del upsert (actualizados en tiempo real) o user_metadata como fallback
    // El username debe estar en user_metadata siempre, incluso si profilesusers falla
    const finalUsername = profileData?.username || userFromDb?.user_metadata?.username || username;
    const finalFullName = userFromDb?.user_metadata?.full_name || nombre;
    const finalEmail = email || userFromDb?.email || updatedUser.user.email;
    const finalAvatar = profileData?.avatar_url || userFromDb?.user_metadata?.avatar_url || finalAvatarUrl;
    const finalRole = userFromDb?.role || updatedUser.user.role || 'user';

    console.log(`📋 [updateProfile] Datos finales a devolver:`, {
      username: finalUsername,
      full_name: finalFullName,
      email: finalEmail,
      has_avatar: !!finalAvatar,
      avatar_url: finalAvatar ? `${finalAvatar.substring(0, 50)}...` : null,
      role: finalRole,
    });

    if (req.cookies && req.cookies.user_username !== finalUsername) {
      // Setear la cookie user_username
      res.cookie('user_username', finalUsername, {
        path: "/",
        maxAge: 60 * 60 * 24 * 1, // 1 día
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        domain: process.env.NODE_ENV === 'development' ? undefined : (process.env.COOKIE_DOMAIN || '.speedleads.app'),
      });
    }

    return res.json({
      success: true,
      message: 'Perfil actualizado correctamente',
      user: {
        id: userId,
        full_name: finalFullName,
        username: finalUsername,
        email: finalEmail,
        avatar_url: finalAvatar,
        role: finalRole,
      },
    });
  } catch (error) {
    console.error('Error en updateProfile:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Error al actualizar perfil',
    });
  }
}

/**
 * Google OAuth: autentica con Google y devuelve JWT.
 */
async function googleAuth(req, res) {
  try {
    const { token: googleToken, user: googleUser } = req.body;
    
    if (!googleToken || !googleUser) {
      return res.status(400).json({ message: 'Token de Google y datos del usuario son requeridos.' });
    }

    const { email, name, picture } = googleUser;
    
    if (!email) {
      return res.status(400).json({ message: 'Email es requerido para autenticación con Google.' });
    }

    // Buscar usuario existente
    let { rows: foundUsers } = await pool.query(
      `SELECT id, email, username, role, avatar_url, full_name
         FROM users
        WHERE email = $1
        LIMIT 1`,
      [email]
    );

    let user;
    if (foundUsers.length === 0) {
      // Crear nuevo usuario
      const username = email.split('@')[0];
      const { rows: newUser } = await pool.query(
        `INSERT INTO users
           (full_name, username, email, password_hash, role, avatar_url, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
         RETURNING id, email, username, role, full_name, avatar_url`,
        [name, username, email, '', 'user', picture]
      );
      user = newUser[0];
      console.log('✅ Nuevo usuario creado con Google OAuth:', email);
    } else {
      user = foundUsers[0];
      // Actualizar avatar si cambió
      if (picture && picture !== user.avatar_url) {
        await pool.query(
          `UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2`,
          [picture, user.id]
        );
        user.avatar_url = picture;
      }
      console.log('✅ Usuario existente autenticado con Google OAuth:', email);
    }

    // Crear JWT token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    // Configurar cookie del token para compartir entre subdominios
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
      domain: process.env.NODE_ENV === 'development' ? undefined : (process.env.COOKIE_DOMAIN || '.speedleads.app'),
      path: '/'
    };

    console.log('🍪 Configurando cookies Google OAuth con opciones:', {
      domain: cookieOptions.domain,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
      nodeEnv: process.env.NODE_ENV
    });

    res.cookie('auth_token', token, cookieOptions);
    res.cookie('user_id', user.id, cookieOptions);

    // Intentar crear/actualizar perfil en profilesusers (de manera opcional)
    try {
      await supabaseAdmin
        .from('profilesusers')
        .upsert({
          user_id: user.id,
          username: user.username,
          avatar_url: user.avatar_url
        }, {
          onConflict: 'user_id'
        });
      console.log('✅ Perfil actualizado en profilesusers');
    } catch (profileErr) {
      console.warn('⚠️ Error actualizando profilesusers (no crítico):', profileErr.message);
      // No bloquear el login si falla profilesusers
    }

    return res.json({
      message: 'Autenticación con Google exitosa.',
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        avatar_url: user.avatar_url || '',
        full_name: user.full_name || '',
      },
      redirect: (process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://www.speedleads.app') + '/dashboard'
    });
  } catch (error) {
    console.error('Error /api/google-auth:', error);
    return res.status(500).json({ message: 'Error interno al autenticar con Google.' });
  }
}

/**
 * Diagnóstico de la tabla profilesusers
 */
async function diagnosProfilesusers(req, res) {
  try {
    const userId = getUserIdFromToken(req);
    if (!userId) {
      return res.status(401).json({ message: 'No autenticado' });
    }

    const diagnostics = {
      userId: userId,
      timestamp: new Date().toISOString(),
      supabaseConnection: false,
      profilesusersTableExists: false,
      userProfile: null,
      errors: []
    };

    // 1. Verificar conexión con Supabase
    try {
      const { data: testData, error: testError } = await supabaseAdmin
        .from('profilesusers')
        .select('count')
        .limit(1);
      
      if (testError) {
        diagnostics.errors.push({
          type: 'table_access',
          message: testError.message,
          code: testError.code,
          hint: testError.hint
        });
      } else {
        diagnostics.supabaseConnection = true;
        diagnostics.profilesusersTableExists = true;
      }
    } catch (err) {
      diagnostics.errors.push({
        type: 'connection',
        message: err.message
      });
    }

    // 2. Verificar perfil del usuario actual
    if (diagnostics.profilesusersTableExists) {
      try {
        const { data: userProfile, error: profileError } = await supabaseAdmin
          .from('profilesusers')
          .select('*')
          .eq('user_id', userId)
          .single();

        if (profileError) {
          if (profileError.code === 'PGRST116') {
            diagnostics.userProfile = 'NOT_FOUND';
          } else {
            diagnostics.errors.push({
              type: 'profile_query',
              message: profileError.message,
              code: profileError.code
            });
          }
        } else {
          diagnostics.userProfile = userProfile;
        }
      } catch (err) {
        diagnostics.errors.push({
          type: 'profile_error',
          message: err.message
        });
      }
    }

    // 3. Verificar datos del usuario en Auth
    try {
      const { user } = await getUserById(userId);
      diagnostics.authUser = {
        id: user.id,
        email: user.email,
        user_metadata: user.user_metadata
      };
    } catch (err) {
      diagnostics.errors.push({
        type: 'auth_user',
        message: err.message
      });
    }

    console.log('🔍 Diagnóstico profilesusers:', diagnostics);

    return res.json({
      status: diagnostics.errors.length === 0 ? 'healthy' : 'issues_detected',
      diagnostics
    });
  } catch (error) {
    console.error('❌ Error en diagnóstico profilesusers:', error);
    return res.status(500).json({ 
      status: 'error',
      message: 'Error ejecutando diagnóstico',
      error: error.message 
    });
  }
}

/**
 * Force Login Check: Permite entrar automáticamente si hay token (incluso expirado)
 */
async function forceLoginCheck(req, res) {
  try {
    console.log('🔥 FORCE LOGIN CHECK iniciado');

    // Buscar cualquier token disponible
    let token = null;
    const authHeader = req.headers['authorization'];
    
    if (authHeader) {
      token = authHeader.split(' ')[1];
    }
    
    if (!token && req.cookies && req.cookies.auth_token) {
      token = req.cookies.auth_token;
      console.log('🍪 Token obtenido de cookie para force check');
    }
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'No hay token disponible para force login',
        needsLogin: true
      });
    }

    let userId = null;
    let tokenValid = false;
    
    try {
      // Intentar verificación normal
      const payload = jwt.verify(token, JWT_SECRET);
      userId = payload.userId || payload.sub;
      tokenValid = true;
      console.log('✅ Token es válido para userId:', userId);
    } catch (err) {
      console.log('⚠️ Token inválido, pero intentando decodificar...');
      
      try {
        // Decodificar sin verificar
        const decoded = jwt.decode(token);
        if (decoded && (decoded.userId || decoded.sub)) {
          userId = decoded.userId || decoded.sub;
          console.log('⚡ FORCE DECODE exitoso para userId:', userId);
        }
      } catch (decodeError) {
        console.log('❌ No se pudo decodificar el token');
        return res.status(401).json({ 
          success: false, 
          message: 'Token completamente inválido',
          needsLogin: true
        });
      }
    }

    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: 'No se pudo extraer userId del token',
        needsLogin: true
      });
    }

    // Buscar usuario en la base de datos
    const { rows: users } = await pool.query(
      'SELECT id, email, username, role, avatar_url, full_name FROM users WHERE id = $1',
      [userId]
    );

    if (users.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'Usuario no encontrado en la base de datos',
        needsLogin: true
      });
    }

    const user = users[0];
    
    // Si llegamos aquí, el usuario existe - generar un nuevo token
    const newToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    
    // Configurar nuevas cookies
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
      domain: process.env.NODE_ENV === 'development' ? undefined : (process.env.COOKIE_DOMAIN || '.speedleads.app'),
      path: '/'
    };

    res.cookie('auth_token', newToken, cookieOptions);
    res.cookie('user_id', user.id, cookieOptions);

    console.log('🔥 FORCE LOGIN EXITOSO para:', user.email);

    return res.json({
      success: true,
      message: 'Force login exitoso - token renovado',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        avatar_url: user.avatar_url || '',
        full_name: user.full_name || '',
      },
      token: newToken,
      tokenWasValid: tokenValid,
      forceLoginUsed: !tokenValid,
      redirect: (process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://www.speedleads.app') + '/dashboard'
    });

  } catch (error) {
    console.error('❌ Error en forceLoginCheck:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error interno en force login',
      needsLogin: true
    });
  }
}

/**
 * Clear Cache: Limpia la caché del navegador para solucionar problemas de Service Worker
 */
async function clearCache(req, res) {
  try {
    console.log('🧹 Iniciando limpieza de caché...');
    
    // Headers para prevenir caché
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    return res.json({
      success: true,
      message: 'Caché limpiada exitosamente',
      instructions: [
        '1. Abre las herramientas de desarrollador (F12)',
        '2. Ve a la pestaña Application/Storage',
        '3. En Storage, haz clic derecho y selecciona "Clear storage"',
        '4. O ejecuta en la consola: clearServiceWorkerCache()',
        '5. Recarga la página'
      ],
      script: `
        // Ejecutar en la consola del navegador
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then(registrations => {
            registrations.forEach(registration => registration.unregister());
          });
        }
        if ('caches' in window) {
          caches.keys().then(names => {
            names.forEach(name => caches.delete(name));
          });
        }
        localStorage.clear();
        sessionStorage.clear();
        location.reload();
      `
    });
    
  } catch (error) {
    console.error('❌ Error en clearCache:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error al limpiar caché' 
    });
  }
}

/**
 * Debug Auth: Endpoint para diagnosticar problemas de autenticación
 */
async function debugAuth(req, res) {
  try {
    console.log('🔍 DEBUG AUTH - Headers:', req.headers);
    console.log('🔍 DEBUG AUTH - Cookies:', req.cookies);
    console.log('🔍 DEBUG AUTH - User:', req.user);
    
    const authHeader = req.headers['authorization'];
    const token = authHeader ? authHeader.split(' ')[1] : null;
    
    let decodedToken = null;
    if (token) {
      try {
        const jwtSecret = process.env.JWT_SECRET || 'clave-secreta-de-desarrollo';
        decodedToken = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
      } catch (err) {
        try {
          decodedToken = jwt.decode(token);
        } catch (decodeErr) {
          console.log('❌ No se pudo decodificar el token');
        }
      }
    }
    
    return res.json({
      success: true,
      debug: {
        hasAuthHeader: !!authHeader,
        hasToken: !!token,
        tokenPreview: token ? token.substring(0, 20) + '...' : null,
        decodedToken,
        userFromReq: req.user,
        cookies: req.cookies,
        headers: {
          authorization: req.headers['authorization'],
          'x-user-id': req.headers['x-user-id'],
          'user-agent': req.headers['user-agent']
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error en debugAuth:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error en debug de autenticación',
      error: error.message
    });
  }
}

export {
    clearCache, debugAuth, forceLoginCheck, getUser, getUserIdFromToken, googleAuth, inviteUserByEmail,
    login, register, supabase, supabaseUrl, updateProfile
};

