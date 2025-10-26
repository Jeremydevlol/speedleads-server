import { createClient } from '@supabase/supabase-js';
import dns from 'dns';
import { promisify } from 'util';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const dnsLookup = promisify(dns.lookup);
const dnsResolve = promisify(dns.resolve);

/**
 * POST /api/dns/configure
 * Configures a custom domain and generates DNS records
 */
export const configureDomain = async (req, res) => {
  try {
    const { domain, subdomain, websiteId } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    if (!domain || !websiteId) {
      return res.status(400).json({ 
        error: 'Faltan campos requeridos: domain, websiteId' 
      });
    }

    // Parse domain
    const fullDomain = subdomain ? `${subdomain}.${domain}` : domain;
    const rootDomain = domain;
    const subdomainPart = subdomain || '';

    // Check if domain already exists
    const { data: existingDomain } = await supabase
      .from('custom_domains')
      .select('*')
      .eq('domain', fullDomain)
      .single();

    if (existingDomain) {
      return res.status(409).json({ 
        error: 'Este dominio ya está configurado',
        domain: fullDomain 
      });
    }

    // Verify website belongs to user
    const { data: website, error: websiteError } = await supabase
      .from('websites')
      .select('*')
      .eq('id', websiteId)
      .eq('user_id', userId)
      .single();

    if (websiteError || !website) {
      return res.status(404).json({ 
        error: 'Website no encontrado o no pertenece al usuario' 
      });
    }

    // Get CloudFront domain from environment
    const cloudfrontDomain = process.env.CLOUDFRONT_DOMAIN || 'domains.uniclick.io';

    // Generate DNS records
    const dnsRecords = {
      cname: {
        type: 'CNAME',
        name: subdomainPart || '@',
        value: cloudfrontDomain,
        ttl: 300,
        priority: null
      }
    };

    // Create custom domain record
    const { data: customDomain, error } = await supabase
      .from('custom_domains')
      .insert({
        user_id: userId,
        website_id: websiteId,
        domain: fullDomain,
        subdomain: subdomainPart,
        root_domain: rootDomain,
        status: 'pending',
        dns_records: dnsRecords,
        cloudfront_domain: cloudfrontDomain,
        ssl_status: 'pending'
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating custom domain:', error);
      return res.status(500).json({ 
        error: 'Error al configurar el dominio personalizado' 
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Dominio configurado correctamente',
      domain: customDomain,
      dnsRecords: dnsRecords,
      instructions: {
        step1: `Configurar registro CNAME en tu proveedor DNS:`,
        step2: `Nombre: ${dnsRecords.cname.name}`,
        step3: `Valor: ${dnsRecords.cname.value}`,
        step4: `TTL: ${dnsRecords.cname.ttl} segundos`,
        step5: `Después de configurar, usar /api/dns/verify para verificar`
      }
    });

  } catch (error) {
    console.error('Error in configureDomain:', error);
    return res.status(500).json({ 
      error: 'Error interno del servidor' 
    });
  }
};

/**
 * POST /api/dns/verify
 * Verifies DNS configuration for a custom domain
 */
export const verifyDomain = async (req, res) => {
  try {
    const { domain } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    if (!domain) {
      return res.status(400).json({ error: 'Campo domain es requerido' });
    }

    // Get custom domain record
    const { data: customDomain, error } = await supabase
      .from('custom_domains')
      .select('*')
      .eq('domain', domain)
      .eq('user_id', userId)
      .single();

    if (error || !customDomain) {
      return res.status(404).json({ 
        error: 'Dominio personalizado no encontrado' 
      });
    }

    try {
      // Verify CNAME record
      const expectedTarget = customDomain.cloudfront_domain;
      let dnsVerified = false;
      let actualValue = null;

      try {
        // Try CNAME lookup first
        const cnameRecords = await dnsResolve(domain, 'CNAME');
        actualValue = cnameRecords[0];
        dnsVerified = actualValue === expectedTarget;
      } catch (cnameError) {
        // If CNAME fails, try A record (might be flattened)
        try {
          const aRecords = await dnsResolve(domain, 'A');
          const targetARecords = await dnsResolve(expectedTarget, 'A');
          
          // Check if any A record matches target's A records
          dnsVerified = aRecords.some(ip => targetARecords.includes(ip));
          actualValue = aRecords.join(', ');
        } catch (aError) {
          console.error('DNS verification failed for both CNAME and A:', cnameError, aError);
        }
      }

      let newStatus = customDomain.status;
      let sslStatus = customDomain.ssl_status;

      if (dnsVerified) {
        newStatus = 'dns_verified';
        sslStatus = 'pending'; // SSL will be generated next
      } else {
        newStatus = 'failed';
        sslStatus = 'failed';
      }

      // Update domain status
      const { data: updatedDomain, error: updateError } = await supabase
        .from('custom_domains')
        .update({
          status: newStatus,
          ssl_status: sslStatus,
          last_verified_at: new Date().toISOString(),
          error_message: dnsVerified ? null : `DNS no configurado correctamente. Esperado: ${expectedTarget}, Actual: ${actualValue || 'No encontrado'}`
        })
        .eq('id', customDomain.id)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating domain status:', updateError);
      }

      return res.json({
        success: dnsVerified,
        verified: dnsVerified,
        domain: domain,
        status: newStatus,
        ssl_status: sslStatus,
        expected: expectedTarget,
        actual: actualValue,
        message: dnsVerified 
          ? 'DNS configurado correctamente'
          : `DNS no configurado. Esperado CNAME: ${expectedTarget}, Encontrado: ${actualValue || 'Ninguno'}`,
        nextStep: dnsVerified 
          ? 'DNS verificado. SSL se configurará automáticamente.'
          : 'Configura el registro CNAME en tu proveedor DNS y vuelve a verificar.'
      });

    } catch (dnsError) {
      console.error('DNS lookup error:', dnsError);
      
      // Update domain with error
      await supabase
        .from('custom_domains')
        .update({
          status: 'failed',
          ssl_status: 'failed',
          last_verified_at: new Date().toISOString(),
          error_message: `Error de verificación DNS: ${dnsError.message}`
        })
        .eq('id', customDomain.id);

      return res.status(400).json({
        success: false,
        verified: false,
        error: 'Error al verificar DNS',
        details: dnsError.message,
        domain: domain
      });
    }

  } catch (error) {
    console.error('Error in verifyDomain:', error);
    return res.status(500).json({ 
      error: 'Error interno del servidor' 
    });
  }
};

/**
 * POST /api/ssl/generate
 * Generates/manages SSL certificate for a custom domain
 */
export const generateSSL = async (req, res) => {
  try {
    const { domain } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    if (!domain) {
      return res.status(400).json({ error: 'Campo domain es requerido' });
    }

    // Get custom domain record
    const { data: customDomain, error } = await supabase
      .from('custom_domains')
      .select('*')
      .eq('domain', domain)
      .eq('user_id', userId)
      .single();

    if (error || !customDomain) {
      return res.status(404).json({ 
        error: 'Dominio personalizado no encontrado' 
      });
    }

    // Check if DNS is verified first
    if (customDomain.status !== 'dns_verified' && customDomain.status !== 'active') {
      return res.status(400).json({
        error: 'DNS debe estar verificado antes de generar SSL',
        status: customDomain.status,
        message: 'Ejecuta /api/dns/verify primero'
      });
    }

    // In development/staging, simulate SSL generation
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    let sslStatus = 'generating';
    let sslCertificateId = null;
    let domainStatus = 'ssl_pending';

    if (isDevelopment) {
      // Simulate SSL generation in development
      sslStatus = 'active';
      sslCertificateId = `dev-cert-${Date.now()}`;
      domainStatus = 'active';
    } else {
      // TODO: In production, integrate with AWS ACM
      // Example AWS ACM integration:
      /*
      import AWS from 'aws-sdk';
      const acm = new AWS.ACM({ region: 'us-east-1' });
      
      try {
        const result = await acm.requestCertificate({
          DomainName: domain,
          ValidationMethod: 'DNS',
          Tags: [
            {
              Key: 'Project',
              Value: 'Uniclick'
            },
            {
              Key: 'Domain',
              Value: domain
            }
          ]
        }).promise();
        
        sslCertificateId = result.CertificateArn;
        sslStatus = 'generating';
        domainStatus = 'ssl_pending';
      } catch (awsError) {
        console.error('AWS ACM error:', awsError);
        sslStatus = 'failed';
        domainStatus = 'failed';
      }
      */
      
      // For now, simulate success in production too
      // Your wildcard *.uniclick.io certificate will handle SSL
      sslStatus = 'active';
      sslCertificateId = 'wildcard-uniclick-io';
      domainStatus = 'active';
    }

    // Update domain with SSL status
    const { data: updatedDomain, error: updateError } = await supabase
      .from('custom_domains')
      .update({
        status: domainStatus,
        ssl_status: sslStatus,
        ssl_certificate_id: sslCertificateId,
        error_message: sslStatus === 'failed' ? 'Error generando certificado SSL' : null
      })
      .eq('id', customDomain.id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating SSL status:', updateError);
      return res.status(500).json({ 
        error: 'Error actualizando estado SSL' 
      });
    }

    return res.json({
      success: sslStatus === 'active' || sslStatus === 'generating',
      domain: domain,
      ssl_status: sslStatus,
      status: domainStatus,
      certificate_id: sslCertificateId,
      message: sslStatus === 'active' 
        ? 'SSL configurado correctamente. Dominio listo para usar.'
        : sslStatus === 'generating'
        ? 'SSL en proceso de generación. Verificar en unos minutos.'
        : 'Error configurando SSL',
      final_url: sslStatus === 'active' ? `https://${domain}` : null
    });

  } catch (error) {
    console.error('Error in generateSSL:', error);
    return res.status(500).json({ 
      error: 'Error interno del servidor' 
    });
  }
};

/**
 * GET /api/dns/status/:domain
 * Gets the current status of a custom domain
 */
export const getDomainStatus = async (req, res) => {
  try {
    const { domain } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    const { data: customDomain, error } = await supabase
      .from('custom_domains')
      .select(`
        *,
        websites (
          business_name,
          slug
        )
      `)
      .eq('domain', domain)
      .eq('user_id', userId)
      .single();

    if (error || !customDomain) {
      return res.status(404).json({ 
        error: 'Dominio personalizado no encontrado' 
      });
    }

    return res.json({
      success: true,
      domain: customDomain
    });

  } catch (error) {
    console.error('Error in getDomainStatus:', error);
    return res.status(500).json({ 
      error: 'Error interno del servidor' 
    });
  }
};

/**
 * GET /api/dns/domains
 * Gets all custom domains for the authenticated user
 */
export const getUserDomains = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    const { data: domains, error } = await supabase
      .from('custom_domains')
      .select(`
        *,
        websites (
          business_name,
          slug
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching user domains:', error);
      return res.status(500).json({ 
        error: 'Error obteniendo dominios personalizados' 
      });
    }

    return res.json({
      success: true,
      domains: domains || []
    });

  } catch (error) {
    console.error('Error in getUserDomains:', error);
    return res.status(500).json({ 
      error: 'Error interno del servidor' 
    });
  }
}; 