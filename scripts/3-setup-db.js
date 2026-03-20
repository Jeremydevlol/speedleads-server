import dotenv from 'dotenv';
import { pg } from '../src/db.js';

dotenv.config();

async function createCampaignTables() {
  console.log("Conectando a la base de datos para crear tablas de Campañas IA...");
  
  const setupSql = `
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    CREATE TABLE IF NOT EXISTS ai_campaigns (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id VARCHAR(255),
      target_account VARCHAR(255) NOT NULL,
      status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'extracting', 'ready', 'sending', 'completed'
      total_leads INT DEFAULT 0,
      contacted_leads INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ai_campaign_leads (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      campaign_id UUID REFERENCES ai_campaigns(id) ON DELETE CASCADE,
      username VARCHAR(255) NOT NULL,
      full_name VARCHAR(255),
      bio TEXT,
      posts JSONB,
      status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'contacted', 'failed'
      dm_sent TEXT,
      interaction_history JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(campaign_id, username)
    );
  `;

  try {
    await pg.query(setupSql);
    console.log("✅ Tablas 'ai_campaigns' y 'ai_campaign_leads' creadas correctamente en Supabase PostgreSQL.");
  } catch (error) {
    console.error("❌ Error creando tablas:", error);
  } finally {
    await pg.end();
    process.exit(0);
  }
}

createCampaignTables();
