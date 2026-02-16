import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '../config/db.js';
import { translateAny } from '../services/translationService.js';

// GET /api/websites - Listar webs del usuario
export async function listWebsites(req, res) {
  try {
    console.log('🔍 listWebsites - req.user:', req.user);
    
    // Intentar obtener userId de diferentes fuentes
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    
    if (!userId) {
      console.error('❌ No se pudo obtener userId del token:', req.user);
      return res.status(401).json({ 
        error: 'Usuario no autenticado',
        debug: {
          user: req.user,
          headers: req.headers
        }
      });
    }

    console.log('✅ Buscando websites para userId:', userId);

    const { data: websites, error } = await supabaseAdmin
      .from('websites')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Database error:', error);
      return res.status(500).json({ error: 'Error al obtener las webs' });
    }

    console.log(`✅ Encontrados ${websites?.length || 0} websites para userId: ${userId}`);

    res.json({ websites: websites || [] });

  } catch (error) {
    console.error('❌ Error fetching websites:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// GET /api/websites/:id - Obtener web específica para editar
export async function getWebsiteById(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.userId || req.user.sub || req.user.id;

    console.log('🔍 getWebsiteById called with:', { id, userId, headers: req.headers.authorization?.substring(0, 20) + '...' });

    // Obtener website primero
    const { data: website, error } = await supabaseAdmin
      .from('websites')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('❌ Database error in getWebsiteById:', error);
      return res.status(500).json({ error: 'Error al obtener la web' });
    }

    if (!website) {
      console.log('⚠️ Website not found:', { id, userId });
      return res.status(404).json({ error: 'Web no encontrada' });
    }

    // Obtener username del propietario por separado
    let ownerUsername = null;
    try {
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profilesusers')
        .select('username')
        .eq('user_id', userId)
        .single();

      if (!profileError && profile) {
        ownerUsername = profile.username;
      }
    } catch (profileErr) {
      console.warn('⚠️ Could not fetch user profile (non-critical):', profileErr.message);
      // No bloquear si falla profilesusers
    }
    
    // Construir URL de publicación
    const publishUrl = ownerUsername ? `https://${ownerUsername}.uniclick.io/web/${website.slug}` : null;

    console.log('✅ Website found successfully:', { 
      id: website.id, 
      businessName: website.business_name,
      ownerUsername,
      publishUrl
    });

    // Devolver website con información del propietario
    const response = {
      ...website,
      // 🎯 NUEVO: Información del propietario
      ownerUsername: ownerUsername,
      ownerSubdomain: ownerUsername,
      publishUrl: publishUrl
    };

    res.json(response);

  } catch (error) {
    console.error('💥 Error fetching website:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// POST /api/websites/upload-video - Subir y comprimir video
export async function uploadVideo(req, res) {
  let tempInputPath = null;
  let tempOutputPath = null;

  try {
    const userId = req.user.userId || req.user.sub || req.user.id;

    if (!req.file) {
      return res.status(400).json({ error: 'No se ha proporcionado un archivo de video' });
    }

    console.log('🎬 Iniciando procesamiento de video:', {
      originalName: req.file.originalname,
      size: `${(req.file.size / 1024 / 1024).toFixed(2)}MB`,
      mimetype: req.file.mimetype
    });

    // Create temp directory if it doesn't exist
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Generate unique filenames
    const uniqueId = uuidv4();
    const originalExt = path.extname(req.file.originalname);
    tempInputPath = path.join(tempDir, `input_${uniqueId}${originalExt}`);
    tempOutputPath = path.join(tempDir, `output_${uniqueId}.mp4`);

    // Write buffer to temp file
    fs.writeFileSync(tempInputPath, req.file.buffer);

    // Get video info first to determine if compression is needed
    const videoInfo = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(tempInputPath, (err, metadata) => {
        if (err) {
          reject(err);
        } else {
          resolve(metadata);
        }
      });
    });

    const videoStream = videoInfo.streams.find(stream => stream.codec_type === 'video');
    const originalWidth = videoStream?.width || 0;
    const originalHeight = videoStream?.height || 0;
    const originalBitrate = videoInfo.format.bit_rate || 0;

    console.log('📊 Video original:', {
      resolution: `${originalWidth}x${originalHeight}`,
      bitrate: `${Math.round(originalBitrate / 1000)}kbps`,
      duration: `${Math.round(videoInfo.format.duration)}s`,
      size: `${(req.file.size / 1024 / 1024).toFixed(2)}MB`
    });

    // TikTok-style compression strategy: preserve quality for videos under 20MB
    const MAX_SIZE_FOR_ORIGINAL = 20 * 1024 * 1024; // 20MB
    const isLargeFile = req.file.size > MAX_SIZE_FOR_ORIGINAL;
    
    // Determine if compression is needed based on file size AND quality
    const needsCompression = isLargeFile || (
      originalWidth > 1920 ||
      originalHeight > 1080 ||
      originalBitrate > 8000000 // Increased to 8Mbps for better quality
    );

    let finalOutputPath = tempInputPath; // Default to original file
    let versions = []; // Store multiple versions for streaming

    if (needsCompression) {
      console.log('🔧 Comprimiendo video con estrategia TikTok-style...');
      console.log(`📏 Archivo: ${(req.file.size / 1024 / 1024).toFixed(2)}MB ${isLargeFile ? '(>20MB)' : '(<20MB)'}`);

      // Create streaming-optimized version
      const streamingOutputPath = path.join(tempDir, `streaming_${uniqueId}.mp4`);
      
      // Calculate target resolution maintaining aspect ratio
      const aspectRatio = originalWidth / originalHeight;
      let targetWidth = Math.min(originalWidth, 1920);
      let targetHeight = Math.min(originalHeight, 1080);

      // Ensure aspect ratio is maintained
      if (targetWidth / aspectRatio > targetHeight) {
        targetWidth = Math.round(targetHeight * aspectRatio);
      } else {
        targetHeight = Math.round(targetWidth / aspectRatio);
      }

      // Ensure even numbers for better compatibility
      targetWidth = targetWidth % 2 === 0 ? targetWidth : targetWidth - 1;
      targetHeight = targetHeight % 2 === 0 ? targetHeight : targetHeight - 1;

      console.log(`🎯 Resolución streaming: ${targetWidth}x${targetHeight}`);

      // Create streaming version with better quality settings
      await new Promise((resolve, reject) => {
        const targetBitrate = isLargeFile ? 3000000 : Math.min(originalBitrate, 6000000); // 3Mbps for large files, 6Mbps for others
        const targetBitrateKbps = Math.round(targetBitrate / 1000);

        ffmpeg(tempInputPath)
          .outputOptions([
            '-c:v libx264',           // H.264 codec
            '-preset medium',         // Better quality than 'fast'
            '-crf 20',               // Higher quality (lower CRF)
            `-maxrate ${targetBitrateKbps}k`,  // Adaptive bitrate
            `-bufsize ${targetBitrateKbps * 2}k`, // Buffer size
            `-vf scale=${targetWidth}:${targetHeight}`, // Scale maintaining quality
            '-c:a aac',              // AAC audio codec
            '-b:a 128k',             // Audio bitrate 128k
            '-movflags +faststart'   // Enable progressive download
          ])
          .output(streamingOutputPath)
          .on('end', () => {
            console.log('✅ Versión streaming creada exitosamente');
            resolve();
          })
          .on('error', (err) => {
            console.error('❌ Error creando versión streaming:', err);
            reject(err);
          })
          .on('progress', (progress) => {
            if (progress.percent) {
              console.log(`⏳ Progreso streaming: ${Math.round(progress.percent)}%`);
            }
          })
          .run();
      });

      // Use streaming version as default, but keep original if file is small enough
      finalOutputPath = streamingOutputPath;
      
      // Store version info
      versions.push({
        type: 'streaming',
        path: streamingOutputPath,
        quality: `${targetWidth}x${targetHeight}`,
        bitrate: isLargeFile ? '3Mbps' : '6Mbps'
      });

      // Keep original version info if file is reasonable size
      if (req.file.size < 50 * 1024 * 1024) { // Under 50MB
        versions.push({
          type: 'original',
          path: tempInputPath,
          quality: `${originalWidth}x${originalHeight}`,
          bitrate: `${Math.round(originalBitrate / 1000)}kbps`
        });
      }

    } else {
      console.log('✅ Video ya está optimizado para streaming, manteniendo calidad original');
      versions.push({
        type: 'original',
        path: tempInputPath,
        quality: `${originalWidth}x${originalHeight}`,
        bitrate: `${Math.round(originalBitrate / 1000)}kbps`
      });
    }

    // Read final file
    const finalBuffer = fs.readFileSync(finalOutputPath);
    const finalSize = finalBuffer.length;

    console.log('📊 Procesamiento completado:', {
      originalSize: `${(req.file.size / 1024 / 1024).toFixed(2)}MB`,
      finalSize: `${(finalSize / 1024 / 1024).toFixed(2)}MB`,
      reduction: needsCompression ? `${(((req.file.size - finalSize) / req.file.size) * 100).toFixed(1)}%` : '0%',
      compressed: needsCompression,
      versions: versions.length
    });

    // 🖼️ Generate thumbnail for instant fallback
    console.log('🖼️ Generando thumbnail para fallback instantáneo...');
    const thumbnailPath = path.join(tempDir, `thumb_${uniqueId}.jpg`);
    
    await new Promise((resolve, reject) => {
      ffmpeg(finalOutputPath)
        .screenshots({
          timestamps: ['10%'], // Capture at 10% of video duration
          filename: `thumb_${uniqueId}.jpg`,
          folder: tempDir,
          size: '720x?', // Maintain aspect ratio, max 720px width
        })
        .on('end', () => {
          console.log('✅ Thumbnail generado exitosamente');
          resolve();
        })
        .on('error', (err) => {
          console.warn('⚠️ Error generando thumbnail, continuando...', err.message);
          resolve(); // Continue even if thumbnail fails
        });
    });

    // Upload thumbnail if generated successfully
    let thumbnailUrl = null;
    if (fs.existsSync(thumbnailPath)) {
      const thumbnailBuffer = fs.readFileSync(thumbnailPath);
      const thumbnailFileName = `${userId}/${uniqueId}_thumbnail.jpg`;
      
      console.log(`📤 Subiendo thumbnail: ${(thumbnailBuffer.length / 1024).toFixed(2)}KB`);

      const { error: thumbError } = await supabaseAdmin.storage
        .from('web-creator-videos')
        .upload(thumbnailFileName, thumbnailBuffer, {
          contentType: 'image/jpeg',
          upsert: false
        });

      if (!thumbError) {
        const { data: thumbUrlData } = supabaseAdmin.storage
          .from('web-creator-videos')
          .getPublicUrl(thumbnailFileName);
        
        thumbnailUrl = thumbUrlData.publicUrl;
        console.log('✅ Thumbnail subido:', thumbnailUrl);
      }

      // Clean up thumbnail file
      fs.unlinkSync(thumbnailPath);
    }

    // Upload all versions to Supabase Storage
    console.log('☁️ Subiendo versiones a Supabase Storage...');
    const uploadedVersions = [];

    for (const version of versions) {
      const versionBuffer = fs.readFileSync(version.path);
      const versionFileName = `${userId}/${uniqueId}_${version.type}.mp4`;
      
      console.log(`📤 Subiendo versión ${version.type}: ${(versionBuffer.length / 1024 / 1024).toFixed(2)}MB`);

      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from('web-creator-videos')
        .upload(versionFileName, versionBuffer, {
          contentType: 'video/mp4',
          upsert: false
        });

      if (uploadError) {
        console.error(`❌ Error subiendo versión ${version.type}:`, uploadError);
        continue; // Continue with other versions
      }

      // Get public URL
      const { data: urlData } = supabaseAdmin.storage
        .from('web-creator-videos')
        .getPublicUrl(versionFileName);

      uploadedVersions.push({
        type: version.type,
        url: urlData.publicUrl,
        fileName: versionFileName,
        size: versionBuffer.length,
        quality: version.quality,
        bitrate: version.bitrate
      });

      console.log(`✅ Versión ${version.type} subida: ${urlData.publicUrl}`);
    }

    // Clean up temp files
    if (tempInputPath && fs.existsSync(tempInputPath)) {
      fs.unlinkSync(tempInputPath);
    }
    if (tempOutputPath && fs.existsSync(tempOutputPath)) {
      fs.unlinkSync(tempOutputPath);
    }
    // Clean up streaming file
    versions.forEach(version => {
      if (version.path !== tempInputPath && fs.existsSync(version.path)) {
        fs.unlinkSync(version.path);
      }
    });

    // Determine primary version (streaming if available, otherwise original)
    const primaryVersion = uploadedVersions.find(v => v.type === 'streaming') || uploadedVersions[0];

    res.json({
      success: true,
      videoUrl: primaryVersion.url, // Primary URL for backward compatibility
      fileName: primaryVersion.fileName,
      originalSize: req.file.size,
      finalSize: primaryVersion.size,
      compressed: needsCompression,
      compressionRatio: needsCompression ? `${(((req.file.size - primaryVersion.size) / req.file.size) * 100).toFixed(1)}%` : '0%',
      quality: primaryVersion.quality,
      resolution: primaryVersion.quality,
      // 🖼️ Instant fallback image for hybrid system
      thumbnailUrl: thumbnailUrl,
      hasThumbnail: !!thumbnailUrl,
      // New TikTok-style features
      versions: uploadedVersions, // All available versions
      streamingOptimized: true,
      preloadReady: true,
      instantFallback: !!thumbnailUrl, // Flag for frontend hybrid system
      tikTokStyle: {
        originalQualityPreserved: uploadedVersions.some(v => v.type === 'original'),
        streamingOptimized: uploadedVersions.some(v => v.type === 'streaming'),
        hybridSupported: !!thumbnailUrl, // Supports image→video hybrid loading
        maxQuality: uploadedVersions.reduce((max, v) => {
          const [width] = v.quality.split('x').map(Number);
          const [maxWidth] = max.split('x').map(Number);
          return width > maxWidth ? v.quality : max;
        }, '0x0')
      }
    });

  } catch (error) {
    console.error('❌ Error procesando video:', error);

    // Clean up temp files in case of error
    if (tempInputPath && fs.existsSync(tempInputPath)) {
      fs.unlinkSync(tempInputPath);
    }
    if (tempOutputPath && fs.existsSync(tempOutputPath)) {
      fs.unlinkSync(tempOutputPath);
    }

    res.status(500).json({ 
      error: 'Error procesando el video',
      details: error.message 
    });
  }
}

// Helper function to get quality label
function getQualityLabel(maxHeight) {
  if (maxHeight >= 2160) return '4K';
  if (maxHeight >= 1080) return 'Full HD';
  if (maxHeight >= 720) return 'HD';
  if (maxHeight >= 480) return 'SD';
  return 'Basic';
}

// GET /api/websites/storage/stats - Estadísticas de almacenamiento
export async function getStorageStats(req, res) {
  try {
    const userId = req.user.userId || req.user.sub || req.user.id;

    // Get user's files from storage
    const { data: files, error } = await supabaseAdmin.storage
      .from('web-creator-videos')
      .list(`${userId}/`, {
        limit: 1000,
        sortBy: { column: 'created_at', order: 'desc' }
      });

    if (error) {
      console.error('Error fetching files:', error);
      return res.status(500).json({ error: 'Error obteniendo estadísticas' });
    }

    // Calculate statistics
    const totalFiles = files?.length || 0;
    const totalSize = files?.reduce((acc, file) => acc + (file.metadata?.size || 0), 0) || 0;
    const totalSizeMB = Math.round(totalSize / 1024 / 1024);

    res.json({
      totalFiles,
      totalSize,
      totalSizeMB,
      maxSizeMB: 500, // Max size per file
      files: files?.map(file => ({
        name: file.name,
        size: file.metadata?.size || 0,
        sizeMB: Math.round((file.metadata?.size || 0) / 1024 / 1024),
        created_at: file.created_at
      })) || []
    });

  } catch (error) {
    console.error('Error getting storage stats:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// POST /api/websites - Crear nueva web
export async function createWebsite(req, res) {
  try {
    const userId = req.user.userId || req.user.sub || req.user.id;
    const { businessName, businessDescription, slug, sections, socialMedia, mainVideo, themeColors } = req.body;

    // Validations
    if (!businessName || !businessDescription) {
      return res.status(400).json({ error: 'Nombre y descripción son requeridos' });
    }

    // Validate slug format
    const slugRegex = /^[a-z0-9-]+$/;
    if (slug && !slugRegex.test(slug)) {
      return res.status(400).json({ 
        code: 'INVALID_SLUG_FORMAT',
        error: 'El slug contiene caracteres no válidos' 
      });
    }

    // Check if slug already exists for this user
    if (slug) {
      const { data: existingWebsite } = await supabaseAdmin
        .from('websites')
        .select('id')
        .eq('user_id', userId)
        .eq('slug', slug)
        .single();

      if (existingWebsite) {
        return res.status(409).json({ 
          code: 'SLUG_ALREADY_EXISTS',
          error: 'Ya tienes una web con ese nombre',
          suggestion: `${slug}-${Date.now()}`
        });
      }
    }

    const { data: website, error } = await supabaseAdmin
      .from('websites')
      .insert({
        user_id: userId,
        business_name: businessName,
        business_description: businessDescription,
        slug: slug,
        sections: sections || [],
        social_media: socialMedia || {},
        main_video: mainVideo || {},
        theme_colors: themeColors || {},
        is_published: false
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Error al crear la web' });
    }

    // Obtener username del propietario por separado
    let ownerUsername = null;
    try {
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profilesusers')
        .select('username')
        .eq('user_id', userId)
        .single();

      if (!profileError && profile) {
        ownerUsername = profile.username;
      }
    } catch (profileErr) {
      console.warn('⚠️ Could not fetch user profile (non-critical):', profileErr.message);
      // No bloquear si falla profilesusers
    }
    
    // Construir URL de publicación
    const publishUrl = ownerUsername ? `https://${ownerUsername}.uniclick.io/web/${website.slug}` : null;

    console.log('✅ Website created successfully:', { 
      id: website.id, 
      businessName: website.business_name,
      ownerUsername,
      publishUrl
    });

    // Devolver website con información del propietario
    const response = {
      ...website,
      // 🎯 NUEVO: Información del propietario
      ownerUsername: ownerUsername,
      ownerSubdomain: ownerUsername,
      publishUrl: publishUrl
    };

    res.status(201).json(response);

  } catch (error) {
    console.error('Error creating website:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// PUT /api/websites/:id - Actualizar web existente
export async function updateWebsite(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.userId || req.user.sub || req.user.id;
    const { businessName, businessDescription, slug, sections, socialMedia, mainVideo, themeColors } = req.body;

    // Verify that the website exists and belongs to the user
    const { data: existingWebsite } = await supabaseAdmin
      .from('websites')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!existingWebsite) {
      return res.status(404).json({ error: 'Web no encontrada' });
    }

    // If changing slug, validate that it doesn't exist
    if (slug) {
      const slugRegex = /^[a-z0-9-]+$/;
      if (!slugRegex.test(slug)) {
        return res.status(400).json({ 
          code: 'INVALID_SLUG_FORMAT',
          error: 'El slug contiene caracteres no válidos' 
        });
      }

      const { data: slugExists } = await supabaseAdmin
        .from('websites')
        .select('id')
        .eq('user_id', userId)
        .eq('slug', slug)
        .neq('id', id)
        .single();

      if (slugExists) {
        return res.status(409).json({ 
          code: 'SLUG_ALREADY_EXISTS',
          error: 'Ya tienes otra web con ese nombre'
        });
      }
    }

    const { error } = await supabaseAdmin
      .from('websites')
      .update({
        business_name: businessName,
        business_description: businessDescription,
        slug: slug,
        sections: sections,
        social_media: socialMedia,
        main_video: mainVideo,
        theme_colors: themeColors,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Error al actualizar la web' });
    }

    res.json({ message: 'Web actualizada correctamente' });

  } catch (error) {
    console.error('Error updating website:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// DELETE /api/websites/:id - Eliminar web Y sus videos
export async function deleteWebsite(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.userId || req.user.sub || req.user.id;

    // 1. Get website data before deleting to clean up videos
    const { data: website } = await supabaseAdmin
      .from('websites')
      .select('main_video, sections')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    // 2. Clean up main video if exists
    if (website?.main_video?.fileName) {
      console.log('🗑️ Eliminando video principal:', website.main_video.fileName);
      
      const { error: storageError } = await supabaseAdmin.storage
        .from('web-creator-videos')
        .remove([website.main_video.fileName]);
        
      if (storageError) {
        console.warn('⚠️ Error eliminando video principal:', storageError);
      }
    }

    // 3. Clean up videos in sections if exist
    if (website?.sections && Array.isArray(website.sections)) {
      for (const section of website.sections) {
        if (section.video?.fileName) {
          console.log('🗑️ Eliminando video de sección:', section.video.fileName);
          
          const { error: storageError } = await supabaseAdmin.storage
            .from('web-creator-videos')
            .remove([section.video.fileName]);
          
          if (storageError) {
            console.warn('⚠️ Error eliminando video de sección:', storageError);
          }
        }
      }
    }

    // 4. Delete website from database
    const { error } = await supabaseAdmin
      .from('websites')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Error al eliminar la web' });
    }

    res.json({ message: 'Web y videos eliminados correctamente' });

  } catch (error) {
    console.error('Error deleting website:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// GET /api/websites/check-slug/:slug - Verificar disponibilidad de slug
export async function checkSlugAvailability(req, res) {
  try {
    const { slug } = req.params;
    const userId = req.user.userId || req.user.sub || req.user.id;

    const { data: existingWebsite } = await supabaseAdmin
      .from('websites')
      .select('id')
      .eq('user_id', userId)
      .eq('slug', slug)
      .single();

    const available = !existingWebsite;
    const suggestions = available ? [] : [
      `${slug}-${Date.now()}`,
      `${slug}-${Math.random().toString(36).substring(2, 8)}`
    ];

    res.json({
      available,
      suggestions
    });

  } catch (error) {
    console.error('Error checking slug:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// POST /api/websites/:id/publish - Publicar web
export async function publishWebsite(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.userId || req.user.sub || req.user.id;

    console.log('🔍 publishWebsite called with:', { id, userId });

    // Verificar que el website pertenece al usuario
    const { data: website, error: websiteError } = await supabaseAdmin
      .from('websites')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (websiteError || !website) {
      console.log('⚠️ Website not found or not owned by user:', { id, userId });
      return res.status(404).json({ error: 'Web no encontrada o no pertenece al usuario' });
    }

    // Obtener el username del propietario
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profilesusers')
      .select('username')
      .eq('user_id', userId)
      .single();

    if (profileError || !profile) {
      console.log('⚠️ User profile not found:', { userId });
      return res.status(404).json({ error: 'Perfil de usuario no encontrado' });
    }

    const ownerUsername = profile.username;
    const slug = website.slug;

    // Publicar el website
    const { error: updateError } = await supabaseAdmin
      .from('websites')
      .update({ is_published: true, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updateError) {
      console.error('❌ Error updating website:', updateError);
      return res.status(500).json({ error: 'Error al publicar la web' });
    }

    // Construir la URL de publicación
    const publishUrl = `https://${ownerUsername}.uniclick.io/web/${slug}`;
    
    console.log('✅ Website published successfully:', { 
      id, 
      businessName: website.business_name, 
      ownerUsername, 
      slug, 
      publishUrl 
    });

    return res.json({
      message: 'Web publicada correctamente',
      website: {
        id: website.id,
        businessName: website.business_name,
        slug: website.slug,
        isPublished: true
      },
      // 🎯 NUEVO: URL de publicación correcta
      publishUrl: publishUrl,
      ownerUsername: ownerUsername,
      ownerSubdomain: ownerUsername
    });

  } catch (error) {
    console.error('💥 Error publishing website:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// POST /api/websites/:id/unpublish - Despublicar web
export async function unpublishWebsite(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.userId || req.user.sub || req.user.id;

    const { error } = await supabaseAdmin
    .from('websites')
      .update({ 
        is_published: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Error al despublicar la web' });
    }

    res.json({ message: 'Web despublicada correctamente' });

  } catch (error) {
    console.error('Error unpublishing website:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// GET /api/websites/public/:username/:slug - Get public website by slug
export async function getPublicWebsiteBySlug(req, res) {
  try {
    const slug = req.params.slug;
    const username = req.params.username;
    
    if (process.env.NODE_ENV !== 'production') console.log(`🔍 getPublicWebsiteBySlug called with: username=${username}, slug=${slug}`);
    
    // 1. Buscar usuario por username (puede haber múltiples)
    const { data: profiles, error: profileError } = await supabaseAdmin
      .from('profilesusers')
      .select('user_id')
      .eq('username', username);
    
    if (profileError || !profiles || profiles.length === 0) {
      console.log(`❌ Usuario no encontrado: ${username}`);
      return res.status(404).json({ 
        error: 'Usuario no encontrado',
        username: username 
      });
    }
    
    // Si hay múltiples usuarios con el mismo username, usar el primero
    const profile = profiles[0];
    console.log(`ℹ️ Usuario "${username}" encontrado (${profiles.length} perfiles, usando el primero)`);
    
    // 2. Buscar website por slug y user_id
    const { data: website, error: websiteError } = await supabaseAdmin
      .from('websites')
      .select(`
        business_name,
        business_description,
        theme_colors,
        social_media,
        main_video,
        sections,
        is_published
      `)
      .eq('slug', slug)
      .eq('user_id', profile.user_id)
      .eq('is_published', true)
      .single();
    
    if (websiteError || !website) {
      console.log(`❌ Website no encontrado: slug=${slug}, user_id=${profile.user_id}`);
      return res.status(404).json({ 
        error: 'Website no encontrado',
        slug: slug,
        username: username,
        message: 'Verifica que el slug sea correcto y el website esté publicado'
      });
    }
    
    // 3. Formatear respuesta
    const site = {
      businessName: website.business_name,
      businessDescription: website.business_description,
      themeColors: website.theme_colors,
      socialMedia: website.social_media,
      mainVideo: website.main_video,
      sections: website.sections, // 🎯 DATOS DEL BUILDER (en sections)
      isPublished: website.is_published
    };
    
    console.log(`✅ Website encontrado: ${site.businessName} (slug: ${slug}, owner: ${username})`);
    
    res.json(site);
    
  } catch (error) {
    console.error('❌ Error in getPublicWebsiteBySlug:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
}

// GET /api/websites/find-username-by-slug - Find username by slug
export async function findUsernameBySlug(req, res) {
  try {
    const { slug } = req.query;
    
    if (!slug) {
      return res.status(400).json({ 
        error: 'Slug es requerido',
        message: 'Proporciona el parámetro slug en la query string'
      });
    }
    
    if (process.env.NODE_ENV !== 'production') console.log(`🔍 findUsernameBySlug called with slug: ${slug}`);
    
    // Buscar website por slug (debe estar publicado)
    const { data: website, error: websiteError } = await supabaseAdmin
      .from('websites')
      .select('user_id')
      .eq('slug', slug)
      .eq('is_published', true)
      .single();
    
    if (websiteError || !website) {
      console.log(`❌ Website not found with slug: ${slug}`);
      return res.status(404).json({ 
        error: 'Website no encontrado',
        slug: slug,
        message: 'Verifica que el slug sea correcto y el website esté publicado'
      });
    }
    
    // Obtener username del propietario
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profilesusers')
      .select('username')
      .eq('user_id', website.user_id)
      .single();
    
    if (profileError || !profile) {
      console.log(`❌ Profile not found for user_id: ${website.user_id}`);
      return res.status(404).json({ 
        error: 'Perfil de usuario no encontrado',
        slug: slug,
        message: 'No se pudo encontrar el username del propietario'
      });
    }
    
    console.log(`✅ Username found: ${profile.username} for slug: ${slug}`);
    
    res.json({
      slug: slug,
      username: profile.username,
      userId: website.user_id
    });
    
  } catch (error) {
    console.error('❌ Error in findUsernameBySlug:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
}

// GET /api/websites/public-by-slug/:slug - Get public website by slug only (no username required)
export async function getPublicWebsiteBySlugOnly(req, res) {
  try {
    const slug = req.params.slug;
    
    if (process.env.NODE_ENV !== 'production') console.log(`🔍 getPublicWebsiteBySlugOnly called with slug: ${slug}`);
    
    // Buscar website por slug (debe estar publicado) usando Supabase
    const { data: website, error: websiteError } = await supabaseAdmin
      .from('websites')
      .select(`
        business_name,
        business_description,
        theme_colors,
        social_media,
        main_video,
        sections,
        is_published,
        user_id
      `)
      .eq('slug', slug)
      .eq('is_published', true)
      .single();
    
    if (websiteError || !website) {
      console.log(`❌ Website not found with slug: ${slug}`);
      return res.status(404).json({ 
        error: 'Website no encontrado',
        slug: slug,
        message: 'Verifica que el slug sea correcto y el website esté publicado'
      });
    }
    
    // Obtener username del propietario
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profilesusers')
      .select('username')
      .eq('user_id', website.user_id)
      .single();
    
    const ownerUsername = profileError ? null : profile?.username;
    
    // Formatear respuesta
    const site = {
      businessName: website.business_name,
      businessDescription: website.business_description,
      themeColors: website.theme_colors,
      socialMedia: website.social_media,
      mainVideo: website.main_video,
      sections: website.sections, // 🎯 DATOS DEL BUILDER (en sections)
      isPublished: website.is_published,
      ownerUsername: ownerUsername
    };
    
    console.log(`✅ Website found: ${site.businessName} (slug: ${slug}, owner: ${site.ownerUsername})`);
    
    res.json(site);
    
  } catch (error) {
    console.error('❌ Error in getPublicWebsiteBySlugOnly:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
}

/**
 * Traduce automáticamente los campos de texto de un website
 */
async function translateWebsiteData(data, targetLanguage, sourceLanguage = 'es') {
  if (!targetLanguage || targetLanguage === sourceLanguage) {
    return data; // No traducir si no se especifica idioma o es el mismo
  }

  try {
    console.log(`🌍 Traduciendo website data de ${sourceLanguage} a ${targetLanguage}...`);
    
    // Preparar los datos para traducción automática
    const dataToTranslate = {
      businessName: data.businessName,
      businessDescription: data.businessDescription,
      socialMedia: data.socialMedia, // Puede contener texto traducible
      mainVideo: data.mainVideo, // Puede contener descripciones
      sections: data.sections // Array complejo con todo el contenido
    };

    // Traducir automáticamente usando nuestro sistema inteligente
    const translationResult = await translateAny(dataToTranslate, targetLanguage, sourceLanguage);

    if (translationResult.success) {
      console.log(`✅ Traducción exitosa: ${translationResult.totalTextsTranslated || 0} textos traducidos, ${translationResult.skippedTexts || 0} omitidos`);
      
      // Combinar datos traducidos con datos no traducibles
      return {
        ...data, // Mantener campos no traducibles (slug, themeColors, etc.)
        businessName: translationResult.translatedData.businessName,
        businessDescription: translationResult.translatedData.businessDescription,
        socialMedia: translationResult.translatedData.socialMedia,
        mainVideo: translationResult.translatedData.mainVideo,
        sections: translationResult.translatedData.sections
      };
    } else {
      console.warn(`⚠️ Error en traducción: ${translationResult.error}`);
      return data; // Devolver datos originales si falla la traducción
    }
  } catch (error) {
    console.error('❌ Error al traducir website data:', error);
    return data; // Devolver datos originales si hay error
  }
}

// POST /api/websites/:id/translate
export async function translateExistingWebsite(req, res) {
  try {
    const userId = req.user.userId || req.user.sub || req.user.id;
  const id = req.params.id;
  const { targetLanguage, sourceLanguage = 'es', createNew = false } = req.body;

  if (!targetLanguage) {
    return res.status(400).json({ 
      success: false, 
      error: "targetLanguage parameter is required" 
    });
  }

    // Obtener el website existente
    const { data: existingWebsite, error: fetchError } = await supabaseAdmin
      .from('websites')
      .select('business_name as businessName, business_description as businessDescription, slug, theme_colors as themeColors, social_media as socialMedia, main_video as mainVideo, sections, is_published as isPublished')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (fetchError || !existingWebsite) {
      return res.status(404).json({ error: 'Website not found' });
    }

    console.log(`🌍 Traduciendo website existente de ${sourceLanguage} a ${targetLanguage}...`);

    // Traducir los datos del website
    const translatedData = await translateWebsiteData(existingWebsite, targetLanguage, sourceLanguage);

    if (createNew) {
      // Crear un nuevo website con los datos traducidos
      const newSlug = `${translatedData.slug}-${targetLanguage}`;
      
      const payload = {
        user_id: userId,
        business_name: translatedData.businessName,
        business_description: translatedData.businessDescription,
        slug: newSlug,
        theme_colors: translatedData.themeColors,
        social_media: translatedData.socialMedia,
        main_video: translatedData.mainVideo,
        sections: translatedData.sections,
        is_published: false // Los nuevos sitios se crean como borrador
      };

      const { data: newWebsite, error: createError } = await supabaseAdmin
        .from('websites')
        .insert(payload)
        .single();

      if (createError) {
        return res.status(500).json({ error: createError.message });
      }

      return res.json({
        success: true,
        action: 'created_new',
        originalId: id,
        newId: newWebsite.id,
        newSlug: newSlug,
        targetLanguage,
        sourceLanguage,
        translatedWebsite: translatedData
      });

    } else {
      // Actualizar el website existente con los datos traducidos
      const { error: updateError } = await supabaseAdmin
        .from('websites')
        .update({
          business_name: translatedData.businessName,
          business_description: translatedData.businessDescription,
          slug: translatedData.slug,
          theme_colors: translatedData.themeColors,
          social_media: translatedData.socialMedia,
          main_video: translatedData.mainVideo,
          sections: translatedData.sections,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('user_id', userId);

      if (updateError) {
        return res.status(500).json({ error: updateError.message });
      }

      return res.json({
        success: true,
        action: 'updated_existing',
        websiteId: id,
        targetLanguage,
        sourceLanguage,
        updated_at: new Date().toISOString(),
        translatedWebsite: translatedData
      });
    }

  } catch (error) {
    console.error('❌ Error al traducir website existente:', error);
    return res.status(500).json({ 
      success: false, 
      error: `Translation failed. Details: ${error.message}` 
    });
  }
}

// POST /api/websites/translate-all
export async function translateAllUserWebsites(req, res) {
  try {
    const userId = req.user.userId || req.user.sub || req.user.id;
  const { targetLanguage, sourceLanguage = 'es', createNew = true } = req.body;

  if (!targetLanguage) {
    return res.status(400).json({ 
      success: false, 
      error: "targetLanguage parameter is required" 
    });
  }

    // Obtener todos los websites del usuario
    const { data: userWebsites, error: fetchError } = await supabaseAdmin
      .from('websites')
      .select('id, business_name as businessName, business_description as businessDescription, slug, theme_colors as themeColors, social_media as socialMedia, main_video as mainVideo, sections, is_published as isPublished')
      .eq('user_id', userId);

    if (fetchError) {
      return res.status(500).json({ error: fetchError.message });
    }

    if (!userWebsites || userWebsites.length === 0) {
      return res.json({
        success: true,
        message: 'No websites found to translate',
        results: {
          total: 0,
          successful: [],
          failed: []
        }
      });
    }

    console.log(`🌍 Iniciando traducción masiva de ${userWebsites.length} websites a ${targetLanguage}...`);

    const results = {
      total: userWebsites.length,
      successful: [],
      failed: [],
      targetLanguage,
      sourceLanguage
    };

    // Traducir cada website
    for (let i = 0; i < userWebsites.length; i++) {
      const website = userWebsites[i];
      
      try {
        console.log(`[${i + 1}/${userWebsites.length}] Traduciendo "${website.businessName}"...`);
        
        // Traducir los datos del website
        const translatedData = await translateWebsiteData(website, targetLanguage, sourceLanguage);

        if (createNew) {
          // Crear un nuevo website con los datos traducidos
          const newSlug = `${website.slug}-${targetLanguage}`;
          
          const payload = {
            user_id: userId,
            business_name: translatedData.businessName,
            business_description: translatedData.businessDescription,
            slug: newSlug,
            theme_colors: translatedData.themeColors,
            social_media: translatedData.socialMedia,
            main_video: translatedData.mainVideo,
            sections: translatedData.sections,
            is_published: false // Los nuevos sitios se crean como borrador
          };

          const { data: newWebsite, error: createError } = await supabaseAdmin
            .from('websites')
            .insert(payload)
            .single();

          if (createError) {
            console.log(`❌ Error creando ${website.businessName}:`, createError.message);
            results.failed.push({
              originalWebsite: website,
              error: createError.message
            });
          } else {
            console.log(`✅ Creada copia traducida: ${newSlug}`);
            results.successful.push({
              action: 'created_new',
              originalId: website.id,
              originalName: website.businessName,
              newId: newWebsite.id,
              newSlug: newSlug
            });
          }

        } else {
          // Actualizar el website existente
          const { error: updateError } = await supabaseAdmin
            .from('websites')
            .update({
              business_name: translatedData.businessName,
              business_description: translatedData.businessDescription,
              slug: translatedData.slug,
              theme_colors: translatedData.themeColors,
              social_media: translatedData.socialMedia,
              main_video: translatedData.mainVideo,
              sections: translatedData.sections,
              updated_at: new Date().toISOString()
            })
            .eq('id', website.id)
            .eq('user_id', userId);

          if (updateError) {
            console.log(`❌ Error actualizando ${website.businessName}:`, updateError.message);
            results.failed.push({
              originalWebsite: website,
              error: updateError.message
            });
          } else {
            console.log(`✅ Actualizado: ${website.businessName}`);
            results.successful.push({
              action: 'updated_existing',
              websiteId: website.id,
              websiteName: website.businessName,
              originalSlug: website.slug
            });
          }
        }

      } catch (error) {
        console.log(`❌ Error procesando ${website.businessName}:`, error.message);
        results.failed.push({
          originalWebsite: website,
          error: error.message
        });
      }

      // Pequeña pausa entre traducciones para no sobrecargar
      if (i < userWebsites.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`🏁 Traducción masiva completada. Éxitos: ${results.successful.length}, Fallos: ${results.failed.length}`);

    return res.json({
      success: true,
      message: `Traducción masiva completada a ${targetLanguage}`,
      results
    });

  } catch (error) {
    console.error('❌ Error en traducción masiva:', error);
    return res.status(500).json({ 
      success: false, 
      error: `Bulk translation failed. Details: ${error.message}` 
    });
  }
}

// TikTok-style Video Streaming Functions

// GET /api/websites/video/stream/:videoId - Stream video with adaptive quality
export async function streamVideo(req, res) {
  try {
    const { videoId } = req.params;
    const { quality = 'auto', connection = 'auto' } = req.query;
    
    console.log('🎬 Streaming video:', { videoId, quality, connection });
    
    // Extract user ID and unique ID from videoId
    // Format: userId/uniqueId_type.mp4
    const videoPath = videoId.replace('.mp4', '');
    const parts = videoPath.split('/');
    if (parts.length < 2) {
      return res.status(400).json({ error: 'Invalid video ID format' });
    }
    
    const userId = parts[0];
    const fileBaseName = parts[1];
    
    // Determine best version based on connection and quality preference
    let preferredVersion = 'streaming'; // Default to streaming version
    
    if (quality === 'original' || connection === 'wifi') {
      preferredVersion = 'original';
    } else if (connection === '3g' || connection === 'slow') {
      preferredVersion = 'streaming';
    }
    
    // Try to get the preferred version
    const fileName = `${userId}/${fileBaseName.split('_')[0]}_${preferredVersion}.mp4`;
    
    console.log('📤 Attempting to stream:', fileName);
    
    // Get file from Supabase Storage
    const { data, error } = await supabaseAdmin.storage
      .from('web-creator-videos')
      .download(fileName);
    
    if (error) {
      // Fallback to other version if preferred not available
      const fallbackVersion = preferredVersion === 'original' ? 'streaming' : 'original';
      const fallbackFileName = `${userId}/${fileBaseName.split('_')[0]}_${fallbackVersion}.mp4`;
      
      console.log('🔄 Fallback to:', fallbackFileName);
      
      const { data: fallbackData, error: fallbackError } = await supabaseAdmin.storage
        .from('web-creator-videos')
        .download(fallbackFileName);
      
      if (fallbackError) {
        console.error('❌ Video not found:', fallbackError);
        return res.status(404).json({ error: 'Video not found' });
      }
      
      data = fallbackData;
    }
    
        // Convert blob to buffer for range request processing
    const buffer = Buffer.from(await data.arrayBuffer());
    const fileSize = buffer.length;
    
    // 📡 Handle Range Requests for progressive streaming
    const range = req.headers.range;
    
    if (range) {
      console.log('📡 Range request detected:', range);
      
      // Parse range header (e.g., "bytes=0-1023")
      const ranges = range.replace(/bytes=/, "").split("-");
      const start = parseInt(ranges[0], 10);
      const end = ranges[1] ? parseInt(ranges[1], 10) : fileSize - 1;
      const chunkSize = (end - start) + 1;
      
      // Validate range
      if (start >= fileSize || end >= fileSize) {
        res.status(416).set({
          'Content-Range': `bytes */${fileSize}`
        });
        return res.end();
      }
      
      // Extract requested chunk
      const chunk = buffer.slice(start, end + 1);
      
      // Set partial content headers
      res.status(206).set({
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'video/mp4',
        'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length'
      });
      
      res.end(chunk);
      console.log(`✅ Range served: ${start}-${end}/${fileSize} (${(chunkSize/1024).toFixed(1)}KB)`);
      
    } else {
      // No range request - serve full file
      res.set({
        'Content-Type': 'video/mp4',
        'Content-Length': fileSize,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Content-Length, Accept-Ranges'
      });

      res.send(buffer);
      console.log('✅ Full video streamed successfully');
    }
    
  } catch (error) {
    console.error('❌ Error streaming video:', error);
    res.status(500).json({ error: 'Error streaming video' });
  }
}

// GET /api/websites/video/preload/:videoId - Preload video for faster playback
export async function preloadVideo(req, res) {
  try {
    const { videoId } = req.params;
    const { connection = 'auto' } = req.query;
    
    console.log('⚡ Preloading video:', { videoId, connection });
    
    // Extract user ID and unique ID from videoId
    const videoPath = videoId.replace('.mp4', '');
    const parts = videoPath.split('/');
    if (parts.length < 2) {
      return res.status(400).json({ error: 'Invalid video ID format' });
    }
    
    const userId = parts[0];
    const fileBaseName = parts[1];
    const uniqueId = fileBaseName.split('_')[0];
    
    // Get video info from storage
    const { data: files, error: listError } = await supabaseAdmin.storage
      .from('web-creator-videos')
      .list(userId, {
        search: uniqueId
      });
    
    if (listError || !files.length) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    // Determine preload strategy based on connection
    let preloadStrategy = 'streaming'; // Default
    
    if (connection === 'wifi') {
      preloadStrategy = 'original'; // Full quality on WiFi
    } else if (connection === '3g' || connection === 'slow') {
      preloadStrategy = 'preview'; // Minimal preload on slow connections
    }
    
    // Find available versions
    const availableVersions = files.filter(file => 
      file.name.includes(uniqueId) && file.name.endsWith('.mp4')
    );
    
    const versions = availableVersions.map(file => {
      const type = file.name.includes('_original') ? 'original' : 'streaming';
      return {
        type,
        url: supabaseAdmin.storage.from('web-creator-videos').getPublicUrl(`${userId}/${file.name}`).data.publicUrl,
        size: file.metadata?.size || 0,
        recommended: type === preloadStrategy
      };
    });
    
    console.log('✅ Preload info generated:', { versions: versions.length, strategy: preloadStrategy });
    
    res.json({
      success: true,
      videoId,
      preloadStrategy,
      connection,
      versions,
      recommendedVersion: versions.find(v => v.recommended) || versions[0],
      tikTokOptimized: true
    });
    
  } catch (error) {
    console.error('❌ Error preloading video:', error);
    res.status(500).json({ error: 'Error preloading video' });
  }
}

// GET /api/websites/video/versions/:videoId - Get all available versions of a video
export async function getVideoVersions(req, res) {
  try {
    const { videoId } = req.params;
    
    console.log('📋 Getting video versions:', videoId);
    
    // Extract user ID and unique ID from videoId
    const videoPath = videoId.replace('.mp4', '');
    const parts = videoPath.split('/');
    if (parts.length < 2) {
      return res.status(400).json({ error: 'Invalid video ID format' });
    }
    
    const userId = parts[0];
    const fileBaseName = parts[1];
    const uniqueId = fileBaseName.split('_')[0];
    
    // Get all video versions from storage
    const { data: files, error: listError } = await supabaseAdmin.storage
      .from('web-creator-videos')
      .list(userId, {
        search: uniqueId
      });
    
    if (listError || !files.length) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    // Process available versions
    const versions = files
      .filter(file => file.name.includes(uniqueId) && file.name.endsWith('.mp4'))
      .map(file => {
        const type = file.name.includes('_original') ? 'original' : 'streaming';
        const publicUrl = supabaseAdmin.storage
          .from('web-creator-videos')
          .getPublicUrl(`${userId}/${file.name}`).data.publicUrl;
        
        return {
          type,
          fileName: file.name,
          url: publicUrl,
          size: file.metadata?.size || 0,
          sizeFormatted: file.metadata?.size ? `${(file.metadata.size / 1024 / 1024).toFixed(2)}MB` : 'Unknown',
          lastModified: file.updated_at || file.created_at
        };
      })
      .sort((a, b) => {
        // Sort: original first, then streaming
        if (a.type === 'original' && b.type === 'streaming') return -1;
        if (a.type === 'streaming' && b.type === 'original') return 1;
        return 0;
      });
    
    console.log('✅ Video versions retrieved:', { versions: versions.length });
    
    res.json({
      success: true,
      videoId,
      uniqueId,
      versions,
      totalVersions: versions.length,
      hasOriginal: versions.some(v => v.type === 'original'),
      hasStreaming: versions.some(v => v.type === 'streaming'),
      tikTokOptimized: true
    });
    
  } catch (error) {
    console.error('❌ Error getting video versions:', error);
    res.status(500).json({ error: 'Error getting video versions' });
  }
}

// POST /api/websites/video/batch-preload - Batch preload multiple videos for performance
export async function batchPreloadVideos(req, res) {
  try {
    const { videoIds = [], connection = 'auto', priority = 'medium' } = req.body;
    
    if (!Array.isArray(videoIds) || videoIds.length === 0) {
      return res.status(400).json({ error: 'videoIds array is required' });
    }
    
    if (videoIds.length > 10) {
      return res.status(400).json({ error: 'Maximum 10 videos per batch request' });
    }
    
    console.log('🚀 Batch preload request:', { 
      count: videoIds.length, 
      connection, 
      priority,
      videos: videoIds.slice(0, 3).join(', ') + (videoIds.length > 3 ? '...' : '')
    });
    
    // Determine preload strategy based on connection and priority
    let preloadStrategy = 'streaming';
    let qualityLevel = 'medium';
    
    if (connection === 'wifi' && priority === 'high') {
      preloadStrategy = 'original';
      qualityLevel = 'high';
    } else if (connection === '3g' || connection === 'slow') {
      preloadStrategy = 'streaming';
      qualityLevel = 'low';
    }
    
    // Process videos in parallel but with controlled concurrency
    const batchResults = [];
    const concurrencyLimit = connection === 'wifi' ? 4 : 2;
    
    for (let i = 0; i < videoIds.length; i += concurrencyLimit) {
      const batch = videoIds.slice(i, i + concurrencyLimit);
      
      const batchPromises = batch.map(async (videoId) => {
        try {
          // Extract user ID and unique ID from videoId
          const videoPath = videoId.replace('.mp4', '');
          const parts = videoPath.split('/');
          if (parts.length < 2) {
            return { videoId, error: 'Invalid video ID format', success: false };
          }
          
          const userId = parts[0];
          const fileBaseName = parts[1];
          const uniqueId = fileBaseName.split('_')[0];
          
          // Get available versions
          const { data: files, error: listError } = await supabaseAdmin.storage
            .from('web-creator-videos')
            .list(userId, {
              search: uniqueId,
              limit: 10 // Limit for performance
            });
          
          if (listError || !files.length) {
            return { videoId, error: 'Video not found', success: false };
          }
          
          // Find available versions and thumbnail
          const videoFiles = files.filter(file => 
            file.name.includes(uniqueId) && file.name.endsWith('.mp4')
          );
          
          const thumbnailFile = files.find(file => 
            file.name.includes(uniqueId) && file.name.includes('thumbnail') && file.name.endsWith('.jpg')
          );
          
          const versions = videoFiles.map(file => {
            const type = file.name.includes('_original') ? 'original' : 'streaming';
            return {
              type,
              url: supabaseAdmin.storage.from('web-creator-videos').getPublicUrl(`${userId}/${file.name}`).data.publicUrl,
              size: file.metadata?.size || 0,
              recommended: type === preloadStrategy,
              priority: type === preloadStrategy ? 'high' : 'medium'
            };
          });
          
          // Add thumbnail info
          let thumbnailUrl = null;
          if (thumbnailFile) {
            thumbnailUrl = supabaseAdmin.storage
              .from('web-creator-videos')
              .getPublicUrl(`${userId}/${thumbnailFile.name}`).data.publicUrl;
          }
          
          return {
            videoId,
            success: true,
            uniqueId,
            versions,
            thumbnailUrl,
            recommendedVersion: versions.find(v => v.recommended) || versions[0],
            preloadStrategy,
            qualityLevel,
            hybridReady: !!thumbnailUrl
          };
          
        } catch (error) {
          console.error('❌ Error in batch processing video:', videoId, error);
          return { videoId, error: error.message, success: false };
        }
      });
      
      const batchResults_partial = await Promise.all(batchPromises);
      batchResults.push(...batchResults_partial);
      
      // Small delay between batches to avoid overwhelming the storage
      if (i + concurrencyLimit < videoIds.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    const successful = batchResults.filter(r => r.success);
    const failed = batchResults.filter(r => !r.success);
    
    console.log('✅ Batch preload completed:', { 
      total: batchResults.length,
      successful: successful.length,
      failed: failed.length 
    });
    
    // Set cache headers for batch preload responses
    res.set({
      'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
      'Vary': 'Accept-Encoding'
    });
    
    res.json({
      success: true,
      processed: batchResults.length,
      successful: successful.length,
      failed: failed.length,
      connection,
      priority,
      preloadStrategy,
      qualityLevel,
      results: batchResults,
      // Optimizations for frontend
      batchOptimized: true,
      concurrencyUsed: concurrencyLimit,
      tikTokBatchSupport: true,
      hybridFallbacksAvailable: successful.filter(r => r.hybridReady).length
    });
    
  } catch (error) {
    console.error('❌ Error in batch preload:', error);
    res.status(500).json({ error: 'Error processing batch preload request' });
  }
}

// GET /api/websites/connection/detect - Detect user connection speed for adaptive streaming
export async function detectConnection(req, res) {
  const startTime = Date.now();
  
  try {
    const userAgent = req.get('user-agent') || '';
    const cfConnectingIp = req.get('cf-connecting-ip');
    const xForwardedFor = req.get('x-forwarded-for');
    const acceptEncoding = req.get('accept-encoding') || '';
    
    // 🕒 Enhanced connection detection with timing and network hints
    let connectionType = 'unknown';
    let recommendedQuality = 'streaming';
    let preloadStrategy = 'minimal';
    let estimatedBandwidth = 0;
    
    // Mobile detection
    const isMobile = /Mobile|Android|iPhone|iPad/i.test(userAgent);
    
    // Enhanced Network Information API support
    const networkInfo = {
      downlink: req.get('downlink') ? parseFloat(req.get('downlink')) : null,
      effectiveType: req.get('effective-connection-type') || null,
      rtt: req.get('round-trip-time') ? parseInt(req.get('round-trip-time')) : null,
      saveData: req.get('save-data') === 'on'
    };
    
    // 🚀 Advanced connection classification
    if (networkInfo.effectiveType) {
      switch (networkInfo.effectiveType) {
        case 'slow-2g':
          connectionType = '2g';
          recommendedQuality = 'streaming';
          preloadStrategy = 'minimal';
          estimatedBandwidth = 0.05; // 50 Kbps
          break;
        case '2g':
          connectionType = '2g';
          recommendedQuality = 'streaming';
          preloadStrategy = 'minimal';
          estimatedBandwidth = 0.25; // 250 Kbps
          break;
        case '3g':
          connectionType = '3g';
          recommendedQuality = 'streaming';
          preloadStrategy = 'moderate';
          estimatedBandwidth = 1.5; // 1.5 Mbps
          break;
        case '4g':
          connectionType = '4g';
          recommendedQuality = 'original';
          preloadStrategy = 'aggressive';
          estimatedBandwidth = 10; // 10 Mbps
          break;
      }
    } else if (networkInfo.downlink) {
      // Use downlink information for classification
      estimatedBandwidth = networkInfo.downlink;
      
      if (networkInfo.downlink >= 10) {
        connectionType = 'wifi';
        recommendedQuality = 'original';
        preloadStrategy = 'aggressive';
      } else if (networkInfo.downlink >= 4) {
        connectionType = '4g';
        recommendedQuality = 'original';
        preloadStrategy = 'aggressive';
      } else if (networkInfo.downlink >= 1.5) {
        connectionType = '4g';
        recommendedQuality = 'streaming';
        preloadStrategy = 'moderate';
      } else if (networkInfo.downlink >= 0.5) {
        connectionType = '3g';
        recommendedQuality = 'streaming';
        preloadStrategy = 'moderate';
      } else {
        connectionType = '2g';
        recommendedQuality = 'streaming';
        preloadStrategy = 'minimal';
      }
    }
    
    // Fallback detection based on user agent and device
    if (connectionType === 'unknown') {
      if (isMobile) {
        connectionType = '4g'; // Assume 4G for mobile
        recommendedQuality = 'streaming';
        preloadStrategy = 'moderate';
        estimatedBandwidth = 5; // Conservative mobile estimate
      } else {
        connectionType = 'wifi'; // Assume WiFi for desktop
        recommendedQuality = 'original';
        preloadStrategy = 'aggressive';
        estimatedBandwidth = 15; // Desktop WiFi estimate
      }
    }
    
    // 📊 Apply data saver mode adjustments
    if (networkInfo.saveData) {
      console.log('📱 Data saver mode detected, adjusting strategy');
      recommendedQuality = 'streaming';
      preloadStrategy = 'minimal';
      estimatedBandwidth = Math.min(estimatedBandwidth, 1); // Cap at 1 Mbps
    }
    
    // ⏱️ Calculate request processing time for latency estimation
    const processingTime = Date.now() - startTime;
    const estimatedLatency = networkInfo.rtt || (processingTime > 100 ? processingTime : 50);
    
    // 🎯 TikTok-style optimization recommendations based on comprehensive analysis
    const tikTokOptimizations = {
      preloadNext: getPreloadCount(preloadStrategy, connectionType),
      bufferSize: getBufferSize(connectionType, estimatedBandwidth),
      initialQuality: recommendedQuality,
      adaptiveStreaming: true,
      compressionLevel: getCompressionLevel(connectionType, estimatedBandwidth),
      // 🚀 New optimization features
      batchSize: getBatchSize(connectionType, estimatedBandwidth),
      prefetchThumbnails: connectionType !== '2g',
      useRangeRequests: connectionType !== '2g',
      concurrentRequests: getConcurrency(connectionType),
      hybridFallback: true, // Always enable hybrid mode
      instantFallback: connectionType === '2g' || networkInfo.saveData
    };
    
    console.log('📡 Enhanced connection detected:', {
      type: connectionType,
      quality: recommendedQuality,
      bandwidth: `${estimatedBandwidth}Mbps`,
      latency: `${estimatedLatency}ms`,
      mobile: isMobile,
      dataSaver: networkInfo.saveData,
      processing: `${processingTime}ms`
    });
    
    // 🏎️ Set optimized cache headers based on connection
    const cacheMaxAge = connectionType === 'wifi' ? 3600 : 1800; // 1 hour for WiFi, 30 min for mobile
    
    res.set({
      'Cache-Control': `public, max-age=${cacheMaxAge}`,
      'Vary': 'Accept-Encoding, User-Agent',
      'X-Connection-Type': connectionType,
      'X-Estimated-Bandwidth': estimatedBandwidth.toString()
    });
    
    res.json({
      success: true,
      connection: {
        type: connectionType,
        isMobile,
        recommendedQuality,
        preloadStrategy,
        estimatedBandwidth,
        estimatedLatency,
        dataSaverMode: networkInfo.saveData,
        tikTokOptimizations
      },
      recommendations: {
        videoQuality: recommendedQuality,
        preloadCount: tikTokOptimizations.preloadNext,
        bufferDuration: tikTokOptimizations.bufferSize,
        useCompression: connectionType !== 'wifi',
        // 🆕 Enhanced recommendations
        batchPreloadSize: tikTokOptimizations.batchSize,
        enableRangeRequests: tikTokOptimizations.useRangeRequests,
        prefetchThumbnails: tikTokOptimizations.prefetchThumbnails,
        maxConcurrentRequests: tikTokOptimizations.concurrentRequests,
        useHybridFallback: tikTokOptimizations.hybridFallback,
        instantFallbackMode: tikTokOptimizations.instantFallback
      },
      networkInfo,
      performance: {
        processingTime,
        estimatedLatency,
        serverTimestamp: new Date().toISOString()
      },
      // 🎬 TikTok-style features
      tikTokEnhanced: true,
      hybridLoadingSupported: true,
      batchPreloadSupported: true,
      rangeRequestsSupported: true
    });
    
  } catch (error) {
    console.error('❌ Error detecting connection:', error);
    
    // Fallback response
    res.json({
      success: false,
      error: 'Connection detection failed',
      fallback: {
        type: 'unknown',
        recommendedQuality: 'streaming',
        preloadStrategy: 'moderate',
        estimatedBandwidth: 2,
        tikTokOptimizations: {
          preloadNext: 1,
          bufferSize: '5s',
          initialQuality: 'streaming',
          hybridFallback: true
        }
      }
    });
  }
}

// 🛠️ Helper functions for connection optimization
function getPreloadCount(strategy, connectionType) {
  if (strategy === 'aggressive' && connectionType === 'wifi') return 3;
  if (strategy === 'aggressive') return 2;
  if (strategy === 'moderate') return 1;
  return 0; // minimal
}

function getBufferSize(connectionType, bandwidth) {
  if (connectionType === 'wifi' || bandwidth >= 10) return '10s';
  if (connectionType === '4g' || bandwidth >= 4) return '7s';
  if (connectionType === '3g' || bandwidth >= 1) return '5s';
  return '3s'; // 2g or very slow
}

function getCompressionLevel(connectionType, bandwidth) {
  if (connectionType === 'wifi' && bandwidth >= 15) return 'low';
  if (connectionType === '4g' && bandwidth >= 8) return 'medium';
  return 'high';
}

function getBatchSize(connectionType, bandwidth) {
  if (connectionType === 'wifi' && bandwidth >= 15) return 6;
  if (connectionType === '4g' && bandwidth >= 8) return 4;
  if (connectionType === '3g' || bandwidth >= 2) return 2;
  return 1; // 2g or very slow
}

function getConcurrency(connectionType) {
  if (connectionType === 'wifi') return 4;
  if (connectionType === '4g') return 3;
  if (connectionType === '3g') return 2;
  return 1; // 2g
}

// GET /api/websites/custom-domain - Serve website via custom domain
export async function getWebsiteByCustomDomain(req, res) {
  try {
    // El middleware ya validó que es un dominio personalizado
    if (!req.isCustomDomain || !req.website) {
      return res.status(404).json({ error: 'Dominio personalizado no encontrado' });
    }

    const website = req.website;
    
    // Verificar que el website esté publicado
    if (!website.is_published) {
      return res.status(404).json({ error: 'Website no disponible' });
    }

    // Obtener datos completos del website
    const { data: fullWebsite, error } = await supabaseAdmin
      .from('websites')
      .select('*')
      .eq('id', website.id)
      .single();

    if (error || !fullWebsite) {
      console.error('Error fetching custom domain website:', error);
      return res.status(404).json({ error: 'Website no encontrado' });
    }

    // Formatear respuesta similar a getPublicWebsiteBySlug
    const response = {
      businessName: fullWebsite.business_name,
      businessDescription: fullWebsite.business_description,
      themeColors: fullWebsite.theme_colors,
      socialMedia: fullWebsite.social_media,
      mainVideo: fullWebsite.main_video,
      sections: fullWebsite.sections,
      isPublished: fullWebsite.is_published,
      customDomain: req.originalHost // Agregar info del dominio personalizado
    };

    // Agregar headers para SEO
    res.set('X-Robots-Tag', 'index, follow');
    res.set('Cache-Control', 'public, max-age=300'); // Cache por 5 minutos
    
    console.log(`🎯 Sirviendo website "${fullWebsite.business_name}" via dominio personalizado: ${req.originalHost}`);
    
    res.json(response);

  } catch (error) {
    console.error('Error in getWebsiteByCustomDomain:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}