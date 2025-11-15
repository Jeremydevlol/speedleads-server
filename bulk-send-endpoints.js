// CÓDIGO PARA AGREGAR EN dist/app.js DESPUÉS DE LA LÍNEA 1771
// (Después del endpoint bulk-send-followers)

// ═══════════════════════════════════════════════════════════
// ENDPOINT 1: Enviar mensajes masivos a usuarios que dieron LIKE
// ═══════════════════════════════════════════════════════════
app.post('/api/instagram/bulk-send-likers', async (req, res) => {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📤❤️ [BULK-LIKERS] Endpoint de envío masivo a likers llamado');
  console.log('📥 [BULK-LIKERS] Body recibido:', JSON.stringify(req.body, null, 2));
  
  const { postUrl, message, limit = 50, delay = 2000, userId, personalityId, send_as_audio = false } = req.body;

  if (!postUrl || !message) {
    return res.status(400).json({
      success: false,
      error: 'postUrl y message son requeridos',
      message: 'Debe proporcionar la URL del post y el mensaje'
    });
  }

  try {
    // Obtener userId y personalityId del bot activo automáticamente
    let actualUserId = userId;
    let actualPersonalityId = personalityId;
    
    const { default: instagramBotService } = await import('./services/instagramBotService.js');
    
    // Si no hay userId, intentar obtenerlo del token JWT
    if (!actualUserId) {
      try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const { validateJwt } = await import('./config/jwt.js');
          try {
            const decoded = await validateJwt({ headers: { authorization: authHeader } }, null, () => {});
            if (decoded) {
              actualUserId = decoded.userId || decoded.sub || decoded.user?.id;
              console.log(`✅ [BULK-LIKERS] userId obtenido del token: ${actualUserId}`);
            }
          } catch (jwtError) {
            console.log(`⚠️ [BULK-LIKERS] Error validando JWT: ${jwtError.message}`);
          }
        }
      } catch (error) {
        console.log(`❌ [BULK-LIKERS] Error obteniendo userId del token: ${error.message}`);
      }
    }
    
    // Si tenemos userId, buscar su bot activo
    if (actualUserId && !actualPersonalityId) {
      try {
        const botData = instagramBotService.activeBots.get(actualUserId);
        if (botData && botData.isRunning && botData.personalityData) {
          actualPersonalityId = botData.personalityData.id;
          console.log(`✅ [BULK-LIKERS] Usando personalidad del bot activo: "${botData.personalityData.nombre}"`);
        }
      } catch (botError) {
        console.log(`❌ [BULK-LIKERS] Error obteniendo bot: ${botError.message}`);
      }
    }
    
    // Si NO tenemos userId ni personalityId, buscar CUALQUIER bot activo
    if (!actualUserId || !actualPersonalityId) {
      for (const [botUserId, botData] of instagramBotService.activeBots.entries()) {
        if (botData && botData.isRunning && botData.personalityData) {
          if (!actualUserId) actualUserId = botUserId;
          if (!actualPersonalityId) actualPersonalityId = botData.personalityData.id;
          if (actualUserId && actualPersonalityId) break;
        }
      }
    }
    
    console.log(`👤 [BULK-LIKERS] userId final: ${actualUserId || 'NINGUNO'}`);
    console.log(`🎭 [BULK-LIKERS] personalityId final: ${actualPersonalityId || 'NINGUNO'}`);

    const { getOrCreateIGSession, igSendMessage } = await import('./services/instagramService.js');
    const { generateBotResponse } = await import('./services/openaiService.js');
    const { supabaseAdmin } = await import('./config/db.js');

    console.log(`❤️ [BULK-LIKERS] Obteniendo likes del post: ${postUrl}`);

    // Obtener sesión de Instagram
    const igService = await getOrCreateIGSession(actualUserId);
    
    // Extraer likes del post
    const likesResult = await igService.getLikesFromPost(postUrl, parseInt(limit));

    if (!likesResult.success || !likesResult.likes || likesResult.likes.length === 0) {
      return res.json({
        success: false,
        error: likesResult.error || 'No se pudieron obtener likes',
        message: `Error obteniendo likes del post`,
        sent_count: 0,
        failed_count: 0,
        total_users: 0
      });
    }

    console.log(`📤 [BULK-LIKERS] Enviando mensajes a ${likesResult.likes.length} usuarios que dieron like...`);

    // Cargar personalidad si está disponible
    let personalityData = null;
    if (actualPersonalityId && actualUserId) {
      try {
        const botData = instagramBotService.activeBots.get(actualUserId);
        
        if (botData && botData.personalityData && botData.personalityData.id === actualPersonalityId) {
          personalityData = botData.personalityData;
          console.log(`✅ [BULK-LIKERS] Usando personalidad del bot activo: "${personalityData.nombre}"`);
        } else {
          const { data: personalityDataFromDB } = await supabaseAdmin
            .from('personalities')
            .select('*')
            .eq('id', actualPersonalityId)
            .eq('users_id', actualUserId)
            .single();
          
          if (personalityDataFromDB) {
            personalityData = personalityDataFromDB;
            
            const { data: additionalInstructions } = await supabaseAdmin
              .from('personality_instructions')
              .select('instruccion')
              .eq('personality_id', actualPersonalityId)
              .eq('users_id', actualUserId)
              .order('created_at', { ascending: true });
            
            if (additionalInstructions && additionalInstructions.length > 0) {
              const additionalText = additionalInstructions.map(instr => instr.instruccion).join('\n');
              personalityData.instrucciones = `${personalityData.instrucciones || ''}\n\n${additionalText}`;
            }
            
            console.log(`✅ [BULK-LIKERS] Personalidad cargada desde DB: "${personalityData.nombre}"`);
          }
        }
      } catch (personalityError) {
        console.log(`❌ [BULK-LIKERS] Error cargando personalidad: ${personalityError.message}`);
      }
    }

    let sentCount = 0;
    let failedCount = 0;
    let aiGeneratedCount = 0;
    const results = [];

    for (let i = 0; i < likesResult.likes.length; i++) {
      const liker = likesResult.likes[i];
      console.log(`\n📨 [BULK-LIKERS] [${i + 1}/${likesResult.likes.length}] Enviando a @${liker.username} (${liker.full_name})`);

      try {
        let finalMessage = message;
        let aiGenerated = false;

        // Generar mensaje con IA si hay personalidad
        if (personalityData && actualUserId) {
          try {
            console.log(`🤖 [BULK-LIKERS] Generando mensaje con IA para @${liker.username}...`);
            
            const userContext = `Usuario: @${liker.username} (${liker.full_name})${liker.is_verified ? ' ✓ Verificado' : ''}
Acción: Dio like al post de @${likesResult.post_info.owner.username}
Post: ${likesResult.post_info.like_count} likes, ${likesResult.post_info.comment_count} comentarios`;

            const promptForAI = `${userContext}\n\nMensaje base: ${message}\n\nGenera un mensaje personalizado mencionando que viste que le gustó el contenido. Sé natural y amigable.`;

            const aiResponse = await generateBotResponse(
              promptForAI,
              [],
              personalityData,
              actualUserId
            );

            if (aiResponse && aiResponse.trim()) {
              finalMessage = aiResponse.trim();
              aiGenerated = true;
              aiGeneratedCount++;
              console.log(`✅ [BULK-LIKERS] Mensaje generado con IA: "${finalMessage.substring(0, 60)}..."`);
            }
          } catch (aiError) {
            console.log(`⚠️ [BULK-LIKERS] Error generando con IA, usando mensaje base: ${aiError.message}`);
          }
        }

        // Enviar mensaje
        const sendResult = await igSendMessage(liker.username, finalMessage, actualUserId);
        
        if (sendResult.success) {
          sentCount++;
          results.push({
            username: liker.username,
            full_name: liker.full_name,
            status: 'sent',
            ai_generated: aiGenerated,
            message_preview: finalMessage.substring(0, 60) + '...',
            timestamp: new Date().toISOString()
          });
          console.log(`✅ [BULK-LIKERS] Mensaje enviado a @${liker.username}`);

          // Guardar en historial
          try {
            if (!igService.conversationHistory) {
              igService.conversationHistory = new Map();
            }
            let history = igService.conversationHistory.get(liker.username) || [];
            history.push({
              role: 'assistant',
              content: finalMessage,
              timestamp: Date.now(),
              isInitialMessage: true
            });
            igService.conversationHistory.set(liker.username, history.slice(-50));
          } catch (histError) {
            console.log(`⚠️ [BULK-LIKERS] Error guardando historial: ${histError.message}`);
          }
        } else {
          failedCount++;
          results.push({
            username: liker.username,
            full_name: liker.full_name,
            status: 'failed',
            error: sendResult.error,
            timestamp: new Date().toISOString()
          });
          console.log(`❌ [BULK-LIKERS] Error enviando a @${liker.username}: ${sendResult.error}`);
          
          if (sendResult.error && sendResult.error.includes('No hay sesión activa')) {
            console.error(`🚨 [BULK-LIKERS] SESIÓN EXPIRADA. Deteniendo proceso...`);
            break;
          }
        }
      } catch (error) {
        failedCount++;
        results.push({
          username: liker.username,
          full_name: liker.full_name,
          status: 'failed',
          error: error.message,
          timestamp: new Date().toISOString()
        });
        console.log(`❌ [BULK-LIKERS] Error: ${error.message}`);
        
        if (error.message && error.message.includes('No hay sesión activa')) {
          console.error(`🚨 [BULK-LIKERS] SESIÓN EXPIRADA. Deteniendo proceso...`);
          break;
        }
      }

      // Delay entre mensajes
      if (i < likesResult.likes.length - 1) {
        console.log(`⏳ [BULK-LIKERS] Esperando ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, parseInt(delay)));
      }
    }

    console.log(`✅ [BULK-LIKERS] Completado: ${sentCount} enviados (${aiGeneratedCount} con IA), ${failedCount} fallidos`);

    res.json({
      success: true,
      message: `Envío masivo completado: ${sentCount} mensajes enviados (${aiGeneratedCount} con IA), ${failedCount} fallidos`,
      postUrl,
      post_info: likesResult.post_info,
      sent_count: sentCount,
      ai_generated_count: aiGeneratedCount,
      failed_count: failedCount,
      total_users: likesResult.likes.length,
      personality_used: actualPersonalityId || null,
      personality_name: personalityData?.nombre || null,
      results
    });

  } catch (error) {
    console.error('❌ [BULK-LIKERS] Error:', error.message);
    res.json({
      success: false,
      error: error.message,
      sent_count: 0,
      failed_count: 0,
      total_users: 0
    });
  }
});

// ═══════════════════════════════════════════════════════════
// ENDPOINT 2: Enviar mensajes masivos a usuarios que COMENTARON
// ═══════════════════════════════════════════════════════════
app.post('/api/instagram/bulk-send-commenters', async (req, res) => {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📤💬 [BULK-COMMENTERS] Endpoint de envío masivo a commenters llamado');
  console.log('📥 [BULK-COMMENTERS] Body recibido:', JSON.stringify(req.body, null, 2));
  
  const { postUrl, message, limit = 50, delay = 2000, userId, personalityId, send_as_audio = false } = req.body;

  if (!postUrl || !message) {
    return res.status(400).json({
      success: false,
      error: 'postUrl y message son requeridos',
      message: 'Debe proporcionar la URL del post y el mensaje'
    });
  }

  try {
    // Obtener userId y personalityId del bot activo automáticamente
    let actualUserId = userId;
    let actualPersonalityId = personalityId;
    
    const { default: instagramBotService } = await import('./services/instagramBotService.js');
    
    // Si no hay userId, intentar obtenerlo del token JWT
    if (!actualUserId) {
      try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const { validateJwt } = await import('./config/jwt.js');
          try {
            const decoded = await validateJwt({ headers: { authorization: authHeader } }, null, () => {});
            if (decoded) {
              actualUserId = decoded.userId || decoded.sub || decoded.user?.id;
              console.log(`✅ [BULK-COMMENTERS] userId obtenido del token: ${actualUserId}`);
            }
          } catch (jwtError) {
            console.log(`⚠️ [BULK-COMMENTERS] Error validando JWT: ${jwtError.message}`);
          }
        }
      } catch (error) {
        console.log(`❌ [BULK-COMMENTERS] Error obteniendo userId del token: ${error.message}`);
      }
    }
    
    // Si tenemos userId, buscar su bot activo
    if (actualUserId && !actualPersonalityId) {
      try {
        const botData = instagramBotService.activeBots.get(actualUserId);
        if (botData && botData.isRunning && botData.personalityData) {
          actualPersonalityId = botData.personalityData.id;
          console.log(`✅ [BULK-COMMENTERS] Usando personalidad del bot activo: "${botData.personalityData.nombre}"`);
        }
      } catch (botError) {
        console.log(`❌ [BULK-COMMENTERS] Error obteniendo bot: ${botError.message}`);
      }
    }
    
    // Si NO tenemos userId ni personalityId, buscar CUALQUIER bot activo
    if (!actualUserId || !actualPersonalityId) {
      for (const [botUserId, botData] of instagramBotService.activeBots.entries()) {
        if (botData && botData.isRunning && botData.personalityData) {
          if (!actualUserId) actualUserId = botUserId;
          if (!actualPersonalityId) actualPersonalityId = botData.personalityData.id;
          if (actualUserId && actualPersonalityId) break;
        }
      }
    }
    
    console.log(`👤 [BULK-COMMENTERS] userId final: ${actualUserId || 'NINGUNO'}`);
    console.log(`🎭 [BULK-COMMENTERS] personalityId final: ${actualPersonalityId || 'NINGUNO'}`);

    const { getOrCreateIGSession, igSendMessage } = await import('./services/instagramService.js');
    const { generateBotResponse } = await import('./services/openaiService.js');
    const { supabaseAdmin } = await import('./config/db.js');

    console.log(`💬 [BULK-COMMENTERS] Obteniendo comentarios del post: ${postUrl}`);

    // Obtener sesión de Instagram
    const igService = await getOrCreateIGSession(actualUserId);
    
    // Extraer comentarios del post
    const commentsResult = await igService.getCommentsFromPost(postUrl, parseInt(limit));

    if (!commentsResult.success || !commentsResult.comments || commentsResult.comments.length === 0) {
      return res.json({
        success: false,
        error: commentsResult.error || 'No se pudieron obtener comentarios',
        message: `Error obteniendo comentarios del post`,
        sent_count: 0,
        failed_count: 0,
        total_users: 0
      });
    }

    console.log(`📤 [BULK-COMMENTERS] Enviando mensajes a ${commentsResult.comments.length} usuarios que comentaron...`);

    // Cargar personalidad si está disponible
    let personalityData = null;
    if (actualPersonalityId && actualUserId) {
      try {
        const botData = instagramBotService.activeBots.get(actualUserId);
        
        if (botData && botData.personalityData && botData.personalityData.id === actualPersonalityId) {
          personalityData = botData.personalityData;
          console.log(`✅ [BULK-COMMENTERS] Usando personalidad del bot activo: "${personalityData.nombre}"`);
        } else {
          const { data: personalityDataFromDB } = await supabaseAdmin
            .from('personalities')
            .select('*')
            .eq('id', actualPersonalityId)
            .eq('users_id', actualUserId)
            .single();
          
          if (personalityDataFromDB) {
            personalityData = personalityDataFromDB;
            
            const { data: additionalInstructions } = await supabaseAdmin
              .from('personality_instructions')
              .select('instruccion')
              .eq('personality_id', actualPersonalityId)
              .eq('users_id', actualUserId)
              .order('created_at', { ascending: true });
            
            if (additionalInstructions && additionalInstructions.length > 0) {
              const additionalText = additionalInstructions.map(instr => instr.instruccion).join('\n');
              personalityData.instrucciones = `${personalityData.instrucciones || ''}\n\n${additionalText}`;
            }
            
            console.log(`✅ [BULK-COMMENTERS] Personalidad cargada desde DB: "${personalityData.nombre}"`);
          }
        }
      } catch (personalityError) {
        console.log(`❌ [BULK-COMMENTERS] Error cargando personalidad: ${personalityError.message}`);
      }
    }

    let sentCount = 0;
    let failedCount = 0;
    let aiGeneratedCount = 0;
    const results = [];

    for (let i = 0; i < commentsResult.comments.length; i++) {
      const commenter = commentsResult.comments[i];
      console.log(`\n📨 [BULK-COMMENTERS] [${i + 1}/${commentsResult.comments.length}] Enviando a @${commenter.username} (${commenter.full_name})`);
      console.log(`   Comentario: "${commenter.comment_text.substring(0, 50)}..."`);

      try {
        let finalMessage = message;
        let aiGenerated = false;

        // Generar mensaje con IA si hay personalidad
        if (personalityData && actualUserId) {
          try {
            console.log(`🤖 [BULK-COMMENTERS] Generando mensaje con IA para @${commenter.username}...`);
            
            const userContext = `Usuario: @${commenter.username} (${commenter.full_name})${commenter.is_verified ? ' ✓ Verificado' : ''}
Acción: Comentó en el post de @${commentsResult.post_info.owner.username}
Su comentario: "${commenter.comment_text}"
Likes en su comentario: ${commenter.like_count}`;

            const promptForAI = `${userContext}\n\nMensaje base: ${message}\n\nGenera un mensaje personalizado haciendo referencia a su comentario. Sé natural y agradecido.`;

            const aiResponse = await generateBotResponse(
              promptForAI,
              [],
              personalityData,
              actualUserId
            );

            if (aiResponse && aiResponse.trim()) {
              finalMessage = aiResponse.trim();
              aiGenerated = true;
              aiGeneratedCount++;
              console.log(`✅ [BULK-COMMENTERS] Mensaje generado con IA: "${finalMessage.substring(0, 60)}..."`);
            }
          } catch (aiError) {
            console.log(`⚠️ [BULK-COMMENTERS] Error generando con IA, usando mensaje base: ${aiError.message}`);
          }
        }

        // Enviar mensaje
        const sendResult = await igSendMessage(commenter.username, finalMessage, actualUserId);
        
        if (sendResult.success) {
          sentCount++;
          results.push({
            username: commenter.username,
            full_name: commenter.full_name,
            comment_text: commenter.comment_text,
            status: 'sent',
            ai_generated: aiGenerated,
            message_preview: finalMessage.substring(0, 60) + '...',
            timestamp: new Date().toISOString()
          });
          console.log(`✅ [BULK-COMMENTERS] Mensaje enviado a @${commenter.username}`);

          // Guardar en historial
          try {
            if (!igService.conversationHistory) {
              igService.conversationHistory = new Map();
            }
            let history = igService.conversationHistory.get(commenter.username) || [];
            history.push({
              role: 'assistant',
              content: finalMessage,
              timestamp: Date.now(),
              isInitialMessage: true,
              context: `Respondiendo a su comentario: "${commenter.comment_text}"`
            });
            igService.conversationHistory.set(commenter.username, history.slice(-50));
          } catch (histError) {
            console.log(`⚠️ [BULK-COMMENTERS] Error guardando historial: ${histError.message}`);
          }
        } else {
          failedCount++;
          results.push({
            username: commenter.username,
            full_name: commenter.full_name,
            comment_text: commenter.comment_text,
            status: 'failed',
            error: sendResult.error,
            timestamp: new Date().toISOString()
          });
          console.log(`❌ [BULK-COMMENTERS] Error enviando a @${commenter.username}: ${sendResult.error}`);
          
          if (sendResult.error && sendResult.error.includes('No hay sesión activa')) {
            console.error(`🚨 [BULK-COMMENTERS] SESIÓN EXPIRADA. Deteniendo proceso...`);
            break;
          }
        }
      } catch (error) {
        failedCount++;
        results.push({
          username: commenter.username,
          full_name: commenter.full_name,
          comment_text: commenter.comment_text,
          status: 'failed',
          error: error.message,
          timestamp: new Date().toISOString()
        });
        console.log(`❌ [BULK-COMMENTERS] Error: ${error.message}`);
        
        if (error.message && error.message.includes('No hay sesión activa')) {
          console.error(`🚨 [BULK-COMMENTERS] SESIÓN EXPIRADA. Deteniendo proceso...`);
          break;
        }
      }

      // Delay entre mensajes
      if (i < commentsResult.comments.length - 1) {
        console.log(`⏳ [BULK-COMMENTERS] Esperando ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, parseInt(delay)));
      }
    }

    console.log(`✅ [BULK-COMMENTERS] Completado: ${sentCount} enviados (${aiGeneratedCount} con IA), ${failedCount} fallidos`);

    res.json({
      success: true,
      message: `Envío masivo completado: ${sentCount} mensajes enviados (${aiGeneratedCount} con IA), ${failedCount} fallidos`,
      postUrl,
      post_info: commentsResult.post_info,
      sent_count: sentCount,
      ai_generated_count: aiGeneratedCount,
      failed_count: failedCount,
      total_users: commentsResult.comments.length,
      personality_used: actualPersonalityId || null,
      personality_name: personalityData?.nombre || null,
      results
    });

  } catch (error) {
    console.error('❌ [BULK-COMMENTERS] Error:', error.message);
    res.json({
      success: false,
      error: error.message,
      sent_count: 0,
      failed_count: 0,
      total_users: 0
    });
  }
});
