import vision from "@google-cloud/vision";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// Función para inicializar el cliente de Vision de manera robusta
const initializeVisionClient = () => {
  try {
    // Opción 1: Variable de entorno GOOGLE_APPLICATION_CREDENTIALS
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.log('🔑 Usando credenciales de Google desde variable de entorno');
      return new vision.ImageAnnotatorClient();
    }

    // Opción 2: Archivo JSON en el directorio de credenciales
    const possiblePaths = [
      join(__dirname, "../credentials/arched-router.json"),
      join(__dirname, "../credentials/brave-cistern-441722-a9-8aa519ef966f.json"),
      join(process.cwd(), "arched-router.json"),
      join(process.cwd(), "brave-cistern-441722-a9-8aa519ef966f.json")
    ];

    for (const jsonPath of possiblePaths) {
      if (existsSync(jsonPath)) {
        console.log(`🔑 Usando credenciales de Google desde: ${jsonPath}`);
        const key = JSON.parse(readFileSync(jsonPath, "utf-8"));
        return new vision.ImageAnnotatorClient({ credentials: key });
      }
    }

    // Opción 3: Credenciales directas desde variables de entorno
    if (process.env.GOOGLE_PRIVATE_KEY && process.env.GOOGLE_CLIENT_EMAIL) {
      console.log('🔑 Usando credenciales de Google desde variables de entorno individuales');
      const credentials = {
        type: "service_account",
        project_id: process.env.GOOGLE_PROJECT_ID || "arched-router-448104-q5",
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        client_id: process.env.GOOGLE_CLIENT_ID,
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token"
      };
      return new vision.ImageAnnotatorClient({ credentials });
    }

    throw new Error('No se encontraron credenciales válidas de Google Cloud Vision');

  } catch (error) {
    console.error('❌ Error inicializando Google Vision:', error.message);
    
    // En producción, lanzar error; en desarrollo, retornar cliente mock
    if (process.env.NODE_ENV === 'production') {
      throw error;
    }
    
    console.warn('⚠️ Usando cliente mock de Google Vision para desarrollo');
    return {
      textDetection: () => Promise.resolve([{ fullTextAnnotation: { text: 'Texto de prueba (Vision no disponible)' } }]),
      documentTextDetection: () => Promise.resolve([{ fullTextAnnotation: { text: 'Texto de prueba (Vision no disponible)' } }]),
      safeSearchDetection: () => Promise.resolve([{ safeSearchAnnotation: { adult: 'VERY_UNLIKELY', violence: 'VERY_UNLIKELY', racy: 'VERY_UNLIKELY' } }])
    };
  }
};

const client = initializeVisionClient();

export default client;

//# sourceMappingURL=vision.js.map