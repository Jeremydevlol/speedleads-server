import axios from 'axios';

const API_KEY = 'BSAE_r19VEJctGohQAVhwo3zQwLcP5m'; // Tu clave API de Brave Search
const BRAVE_API_URL = 'https://api.search.brave.com/api/v1/web/search';

export async function searchBrave(query, numResults = 5) {
  try {
    const response = await axios.get(BRAVE_API_URL, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': API_KEY,
      },
      params: {
        q: query,
        count: numResults
      }
    });

    return response.data.results;
  } catch (error) {
    console.error('Error al realizar la búsqueda en Brave:', error.message);
    return [];
  }
}
