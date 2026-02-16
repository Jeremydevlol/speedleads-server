declare namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: string;
      PORT: string;
      FRONTEND_URL: string;
      BACKEND_URL: string;
      SESSION_SECRET?: string;
      JWT_SECRET?: string;
      OPENAI_API_KEY?: string;
      DATABASE_URL?: string;
      GOOGLE_CLIENT_ID?: string;
      GOOGLE_CLIENT_SECRET?: string;
      GOOGLE_TRANSLATE_API_KEY?: string;
      // Agrega más si necesitas
      [key: string]: string | undefined;
    }
  }
  