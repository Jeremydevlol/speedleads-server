import axios from 'axios';

const CF_API_TOKEN = process.env.CF_API_TOKEN;
const CF_ZONE_ID = process.env.CF_ZONE_ID;
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID;
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID; // Opcional

const checkIfSubdomainExists = async (subdomain) => {
  try {
    const response = await axios.get(
      `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records`,
      {
        headers: { Authorization: `Bearer ${CF_API_TOKEN}` }
      }
    );
    const existingRecord = response.data.result.find(
      (record) => record.name === `${subdomain}.speedleads.io`
    );
    return existingRecord ? `${subdomain}.speedleads.io` : null;
  } catch (error) {
    console.error('Error al verificar el subdominio:', error);
    return null;
  }
};

const createCnameRecord = async (req, res) => {
  const { subdomain } = req.body;
  if (!subdomain) return res.status(400).json({ error: 'subdomain missing' });

  try {
    const existingSubdomain = await checkIfSubdomainExists(subdomain);
    if (!existingSubdomain) {
      await axios.post(
        `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records`,
        {
          type: 'CNAME',
          name: subdomain,
          content: 'cname.vercel-dns.com',
          ttl: 3600,
          proxied: false,
        },
        { headers: { Authorization: `Bearer ${CF_API_TOKEN}` } }
      );
      console.log(`Subdominio ${subdomain} creado en Cloudflare.`);
    }

    const vercelUrl = VERCEL_TEAM_ID
      ? `https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/domains?teamId=${VERCEL_TEAM_ID}`
      : `https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/domains`;

    const response = await axios.post(
      vercelUrl,
      { name: `${subdomain}.speedleads.io`, configuration: { production: true } },
      {
        headers: {
          Authorization: `Bearer ${VERCEL_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('Dominio registrado en Vercel:', response.data);

    const verification = response.data.verification?.find(v => v.type === 'TXT');
    if (verification) {
      await axios.post(
        `https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records`,
        {
          type: 'TXT',
          name: verification.domain,
          content: verification.value,
          ttl: 3600,
        },
        { headers: { Authorization: `Bearer ${CF_API_TOKEN}` } }
      );
      console.log(`Registro TXT para verificación creado en Cloudflare: ${verification.domain}`);
    }

    return res.status(201).json({ message: 'Subdominio creado, registrado y verificado', subdomain: `${subdomain}.speedleads.io` });
  } catch (error) {
    console.error('Error creando/verificando subdominio:', error.response?.data || error.message);
    return res.status(500).json({ error: 'Error al crear/verificar subdominio', details: error.response?.data });
  }
};

export { createCnameRecord, checkIfSubdomainExists };
