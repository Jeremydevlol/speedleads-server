import { GoogleAuth } from 'google-auth-library';
import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const jsonPath = join(__dirname, "../credentials/arched-router.json");
const key = JSON.parse(readFileSync(jsonPath, "utf-8"));

const auth = new GoogleAuth({
  credentials: key,
  scopes: ['https://www.googleapis.com/auth/cse']
});

const auth2 = new GoogleAuth({
  credentials: key,
  scopes: ['https://www.googleapis.com/auth/calendar']
});

const customsearch = google.customsearch({ version: 'v1', auth });

const CX = '61b2c474c9bf240bb'; // Reemplaza con el ID de tu motor de búsqueda

export async function searchGoogle(query, num = 5) {
  try {
    const res = await customsearch.cse.list({
      cx: CX,
      q: query,
      num,
    });

    return res.data.items || [];
  } catch (err) {
    console.error('Error al realizar búsqueda:', err.message);
    return [];
  }
}

const calendar = google.calendar({ version: 'v3', auth2 })

export async function listEvents({ timeMin = new Date().toISOString(), maxResults = 10 } = {}) {
  const resp = await calendar.events.list({
    calendarId: 'primary',
    timeMin,
    maxResults,
    singleEvents: true,
    orderBy: 'startTime'
  })
  return resp.data.items || []
}

/**
 * Inserta un evento nuevo en el calendario “primary”
 */
export async function createEvent({ summary, description, startDateTime, endDateTime }) {
  const resp = await calendar.events.insert({
    calendarId: 'primary',
    resource: {
      summary,
      description,
      start: { dateTime: new Date(startDateTime).toISOString() },
      end:   { dateTime: new Date(endDateTime).toISOString() }
    }
  })
  return resp.data
}

/**
 * Borra un evento por su ID
 */
export async function deleteEvent(eventId) {
  await calendar.events.delete({
    calendarId: 'primary',
    eventId
  })
  return { success: true }
}
export async function createGoogleEvent({ summary, description, startDateTime, endDateTime }) {
  const resp = await calendar.events.insert({
    calendarId: 'primary',
    resource: {
      summary,
      description,
      start: { dateTime: new Date(startDateTime).toISOString() },
      end:   { dateTime: new Date(endDateTime).toISOString() }
    }
  })
  return resp.data
}

/**
 * Lista los próximos eventos
 */
export async function listGoogleEvents({ timeMin = new Date().toISOString(), maxResults = 10 } = {}) {
  const resp = await calendar.events.list({
    calendarId: 'primary',
    timeMin,
    maxResults,
    singleEvents: true,
    orderBy: 'startTime'
  })
  return resp.data.items || []
}