import { supabaseAdmin } from '../config/db.js';

// GET /api/user/plan - Get user's current plan
export async function getUserPlan(req, res) {
  try {
    const userId = req.user.userId || req.user.sub || req.user.id;

    // Use the database function to get user plan
    const { data: planData, error } = await supabaseAdmin
      .rpc('get_user_plan', { user_uuid: userId });

    if (error) {
      console.error('Error fetching user plan:', error);
      return res.status(500).json({ error: 'Error obteniendo plan del usuario' });
    }

    const userPlan = planData?.[0] || {
      plan_id: 'free',
      plan_name: 'Free',
      max_width: 854,
      max_height: 480,
      max_bitrate: 1000000,
      max_file_size_mb: 100,
      max_videos_per_website: 1,
      max_websites: 2,
      features: ['480p video quality', '2 websites max', '1 video per website', 'Basic support'],
      status: 'active',
      expires_at: null
    };

    res.json({
      plan: userPlan.plan_id,
      planName: userPlan.plan_name,
      status: userPlan.status,
      expiresAt: userPlan.expires_at,
      limits: {
        maxWidth: userPlan.max_width,
        maxHeight: userPlan.max_height,
        maxBitrate: userPlan.max_bitrate,
        maxFileSizeMB: userPlan.max_file_size_mb,
        maxVideosPerWebsite: userPlan.max_videos_per_website,
        maxWebsites: userPlan.max_websites
      },
      features: userPlan.features
    });

  } catch (error) {
    console.error('Error getting user plan:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// GET /api/user/plans - Get all available plans
export async function getAllPlans(req, res) {
  try {
    const { data: plans, error } = await supabaseAdmin
      .from('plan_configs')
      .select('*')
      .eq('is_active', true)
      .order('price_monthly', { ascending: true });

    if (error) {
      console.error('Error fetching plans:', error);
      return res.status(500).json({ error: 'Error obteniendo planes' });
    }

    const formattedPlans = plans.map(plan => ({
      id: plan.id,
      name: plan.name,
      priceMonthly: plan.price_monthly,
      priceYearly: plan.price_yearly,
      limits: {
        maxWidth: plan.max_width,
        maxHeight: plan.max_height,
        maxBitrate: plan.max_bitrate,
        maxFileSizeMB: plan.max_file_size_mb,
        maxVideosPerWebsite: plan.max_videos_per_website,
        maxWebsites: plan.max_websites
      },
      features: plan.features,
      quality: getQualityLabel(plan.max_height)
    }));

    res.json({ plans: formattedPlans });

  } catch (error) {
    console.error('Error getting plans:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// POST /api/user/check-upload-limits - Check if user can upload video
export async function checkUploadLimits(req, res) {
  try {
    const userId = req.user.userId || req.user.sub || req.user.id;
    const { fileSizeBytes, websiteId } = req.body;

    if (!fileSizeBytes) {
      return res.status(400).json({ error: 'fileSizeBytes is required' });
    }

    // Use the database function to check upload limits
    const { data: checkResult, error } = await supabaseAdmin
      .rpc('can_user_upload_video', {
        user_uuid: userId,
        file_size_bytes: fileSizeBytes,
        website_id: websiteId || null
      });

    if (error) {
      console.error('Error checking upload limits:', error);
      return res.status(500).json({ error: 'Error verificando límites' });
    }

    const result = checkResult?.[0] || {
      can_upload: false,
      reason: 'Unknown error',
      current_plan: 'free',
      suggested_plan: 'basic'
    };

    if (!result.can_upload) {
      return res.status(403).json({
        canUpload: false,
        reason: result.reason,
        currentPlan: result.current_plan,
        suggestedPlan: result.suggested_plan,
        upgrade: true
      });
    }

    res.json({
      canUpload: true,
      reason: result.reason,
      currentPlan: result.current_plan
    });

  } catch (error) {
    console.error('Error checking upload limits:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// GET /api/user/usage - Get user's current usage statistics
export async function getUserUsageStats(req, res) {
  try {
    const userId = req.user.userId || req.user.sub || req.user.id;

    // Get user's websites count
    const { count: websitesCount, error: websitesError } = await supabaseAdmin
      .from('websites')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (websitesError) {
      console.error('Error counting websites:', websitesError);
      return res.status(500).json({ error: 'Error obteniendo estadísticas' });
    }

    // Get storage usage
    const { data: storageFiles, error: storageError } = await supabaseAdmin.storage
      .from('web-creator-videos')
      .list(`${userId}/`, {
        limit: 1000
      });

    if (storageError) {
      console.error('Error fetching storage usage:', storageError);
      return res.status(500).json({ error: 'Error obteniendo uso de almacenamiento' });
    }

    const totalStorageSize = storageFiles?.reduce((acc, file) => {
      return acc + (file.metadata?.size || 0);
    }, 0) || 0;

    const totalStorageMB = Math.round(totalStorageSize / 1024 / 1024);

    // Count videos per website
    const { data: websites, error: websiteDataError } = await supabaseAdmin
      .from('websites')
      .select('id, main_video, sections')
      .eq('user_id', userId);

    if (websiteDataError) {
      console.error('Error fetching websites data:', websiteDataError);
      return res.status(500).json({ error: 'Error obteniendo datos de webs' });
    }

    let totalVideos = 0;
    const websiteVideoStats = websites?.map(website => {
      let videoCount = 0;
      
      // Count main video
      if (website.main_video?.fileName) {
        videoCount++;
      }
      
      // Count section videos
      if (website.sections && Array.isArray(website.sections)) {
        const sectionVideos = website.sections.filter(section => 
          section.video?.fileName
        ).length;
        videoCount += sectionVideos;
      }
      
      totalVideos += videoCount;
      
      return {
        websiteId: website.id,
        videoCount
      };
    });

    res.json({
      usage: {
        websites: websitesCount || 0,
        totalVideos,
        storageUsedMB: totalStorageMB,
        storageUsedBytes: totalStorageSize
      },
      breakdown: {
        websiteVideoStats: websiteVideoStats || []
      }
    });

  } catch (error) {
    console.error('Error getting usage stats:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
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

// Helper function to get suggested plan based on file size
export function getSuggestedPlan(fileSizeBytes) {
  const sizeMB = fileSizeBytes / 1024 / 1024;
  
  if (sizeMB <= 100) return 'free';
  if (sizeMB <= 500) return 'basic';
  if (sizeMB <= 1024) return 'premium';
  return 'pro';
}

// Helper function to get quality limits by plan
export function getQualityLimits(planId) {
  const limits = {
    'free': {
      maxWidth: 854,
      maxHeight: 480,
      maxBitrate: 1000000,
      maxFileSizeMB: 100,
      maxVideosPerWebsite: 1,
      maxWebsites: 2
    },
    'basic': {
      maxWidth: 1280,
      maxHeight: 720,
      maxBitrate: 2500100,
      maxFileSizeMB: 500,
      maxVideosPerWebsite: 3,
      maxWebsites: 5
    },
    'premium': {
      maxWidth: 1920,
      maxHeight: 1080,
      maxBitrate: 5001000,
      maxFileSizeMB: 1024,
      maxVideosPerWebsite: 10,
      maxWebsites: 15
    },
    'pro': {
      maxWidth: 3840,
      maxHeight: 2160,
      maxBitrate: 15001000,
      maxFileSizeMB: 5120,
      maxVideosPerWebsite: null, // unlimited
      maxWebsites: null // unlimited
    }
  };
  
  return limits[planId] || limits['free'];
} 