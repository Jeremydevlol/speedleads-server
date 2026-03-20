import 'dotenv/config';
import { getOrCreatePrivateClient, privateApiLogin } from './dist/services/instagramPrivateApi.service.js';

async function testNews() {
  const userId = '2614da61-29f7-4f2e-9a9b-dcb8e1bbdae7';
  // We need to login or restore session.
  const client = getOrCreatePrivateClient(userId);
  await client.restoreSession();

  try {
    const newsFeed = client.ig.feed.news();
    const items = await newsFeed.items();
    console.log(`Encontrados ${items.length} notificaciones en News feed.`);
    const comments = items.filter(i => i.args?.text?.includes('comment') || i.story_type === 13 || i.story_type === 11);
    console.log(JSON.stringify(comments.slice(0, 3), null, 2));
  } catch (e) {
    console.error('Error fetching news:', e.message);
  }
}

testNews();
