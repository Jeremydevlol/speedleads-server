import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import { IgApiClient } from 'instagram-private-api';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();
process.env.IG_PROXY_URL = '';

const BD_API_TOKEN = process.env.BD_SCRAPER_TOKEN || '1c5e0ade-7d2f-419f-b162-04cd30f0cc76';
const DATASET_ID = 'gd_l1vikfch901nx3by4'; 

const IG_USERNAME = 'nfnn404';
const IG_PASSWORD = 'Dios2090.';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEADS_FILE = path.join(__dirname, 'campaign_leads.json');

function loadLeads() {
    if (fs.existsSync(LEADS_FILE)) {
        return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf-8'));
    }
    return {};
}

function saveLeads(leadsObj) {
    fs.writeFileSync(LEADS_FILE, JSON.stringify(leadsObj, null, 2), 'utf-8');
}

async function extractAndSaveLeads(targetAccount, maxExtract = 50) {
    console.log(`\n🚀 PASO 1: EXTRACCIÓN MASIVA DE @${targetAccount}`);
    const ig = new IgApiClient();
    ig.state.generateDevice(IG_USERNAME);
    await ig.simulate.preLoginFlow();
    await ig.account.login(IG_USERNAME, IG_PASSWORD);
    
    // 1. Obtener Usernames de IG
    const targetId = await ig.user.getIdByUsername(targetAccount);
    const followersFeed = ig.feed.accountFollowers(targetId);
    let allUsernames = [];
    
    console.log(`\n🕵️ Paginar seguidores de Instagram...`);
    while (allUsernames.length < maxExtract) {
        const items = await followersFeed.items();
        if (items.length === 0) break;
        allUsernames.push(...items.map(i => i.username));
        // Espera corta entre páginas de IG
        await new Promise(r => setTimeout(r, 2000));
    }
    allUsernames = allUsernames.slice(0, maxExtract);
    console.log(`   ✅ Extraídos ${allUsernames.length} nombres de usuario.\n`);

    // 2. Scrapearlos con Bright Data
    console.log(`⚡ Enviando ${allUsernames.length} perfiles a Bright Data...`);
    const urlsToScrape = allUsernames.map(u => `https://www.instagram.com/${u}/`);
    
    const bdResponse = await axios.post(
      `https://api.brightdata.com/datasets/v3/scrape?dataset_id=${DATASET_ID}&notify=false&include_errors=true`,
      urlsToScrape.map(url => ({ url })),
      { headers: { 'Authorization': `Bearer ${BD_API_TOKEN}`, 'Content-Type': 'application/json' }, timeout: 120000 }
    );
    
    let scrapedData = bdResponse.data;
    if (typeof scrapedData === 'string') {
        scrapedData = scrapedData.trim().split('\n').filter(Boolean).map(line => {
            try { return JSON.parse(line) } catch (e) { return null }
        }).filter(Boolean);
    }
    if (!Array.isArray(scrapedData)) scrapedData = [scrapedData];
    
    console.log(`   ✅ Bright Data devolvió ${scrapedData.length} perfiles detallados.\n`);

    // 3. Guardarlos en BD (JSON)
    const currentLeads = loadLeads();
    let newLeadsCount = 0;
    
    for (const profile of scrapedData) {
        if (!profile) continue;
        const username = profile.username || profile.account;
        if (!username) continue;

        // Solo guardar si no existía ya en la base de datos
        if (!currentLeads[username]) {
            currentLeads[username] = {
                username: username,
                name: profile.full_name || '',
                bio: profile.biography || '',
                posts: profile.posts || [],
                status: 'pending', // 'pending' = Aún no le enviamos DM
                date_added: new Date().toISOString()
            };
            newLeadsCount++;
        }
    }

    saveLeads(currentLeads);
    console.log(`💾 Base de Datos actualizada: Se agregaron ${newLeadsCount} leads totalmente nuevos.`);
    console.log(`📊 Total de leads en espera en el sistema: ${Object.values(currentLeads).filter(l => l.status === 'pending').length}`);
}

// Ejecutar la extracción (Ejemplo: extraemos unos 30 seguidores para probar)
extractAndSaveLeads('uniclick.io', 30);
