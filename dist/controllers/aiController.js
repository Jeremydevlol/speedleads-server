/**
 * AI Controller - Usa OpenAI para generación de contenido
 */

import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, generateText } from "ai";
import { z } from "zod";
import { translateAny } from "../services/translationService.js";

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function generateAiText(req, res) {
  const input = req.body;

  try {
    const { prompt } = z.object({ prompt: z.string() }).parse(input);

    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      prompt: prompt,
      maxTokens: 100,
    });

    res.json({ success: true, text: text.replace(/"/g, "") });
  } catch (error) {
    console.error("Error generating AI text:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    res.status(500).json({ success: false, error: `Failed to generate text. Details: ${errorMessage}` });
  }
}

export async function generateSectionsWithIcons(req, res) {
  const { businessName, businessDescription } = req.body;

  if (!businessName || !businessDescription) {
    return res.status(400).json({ success: false, error: "Business name and description are required." });
  }

  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: sectionsSchema,
      prompt: `You are a helpful assistant that generates menu sections for businesses. 

For a business called "${businessName}" with the description "${businessDescription}", generate between 3 and 5 relevant menu sections.

For each section, provide:
- title: A clear, descriptive section name (e.g., "Appetizers", "Main Courses", "Desserts")
- description: A brief, attractive description (maximum 15 words)
- icon: A single Iconify icon name that represents the section (e.g., "mdi:food-turkey", "carbon:cafe", "lucide:coffee")

Make sure the response is a valid JSON object that matches this exact structure:
{
  "sections": [
    {
      "title": "Section Name",
      "description": "Brief description",
      "icon": "iconify-icon-name"
    }
  ]
}

Focus on creating sections that make sense for the type of business described.`,
      temperature: 0.7,
    });

    const validSections = object.sections.filter(
      (section) =>
        section.title &&
        section.description &&
        section.icon &&
        typeof section.title === "string" &&
        typeof section.description === "string" &&
        typeof section.icon === "string",
    );

    if (validSections.length === 0) {
      throw new Error("No valid sections generated");
    }

    res.json({ success: true, sections: validSections });
  } catch (error) {
    console.error("Error generating sections with icons:", error);
    res.json({ success: false, error: `Failed to generate sections with icons. Details: ${error instanceof Error ? error.message : "An unknown error occurred."}` });
  }
}

const menuItemSchema = z.object({
  title: z.string().describe("Nombre del producto o plato."),
  description: z.string().describe("Descripción del producto, si está disponible en el menú."),
  price: z.string().optional().describe("Precio del producto, si está disponible."),
})

const menuSectionSchema = z.object({
  title: z.string().describe("Título de la sección del menú (ej: Entrantes, Platos Principales, Postres)."),
  description: z.string().describe("Descripción breve y atractiva de la sección, de no más de 15 palabras."),
  icon: z
    .string()
    .describe("Un solo ícono de Iconify (ej: 'mdi:food-turkey', 'carbon:cafe') que represente la sección."),
  items: z.array(menuItemSchema),
})

const fullMenuSchema = z.object({
  businessName: z.string().describe("El nombre del negocio que aparece en el menú."),
  businessDescription: z
    .string()
    .describe("Una descripción corta y atractiva del negocio, inferida del estilo y contenido del menú."),
  sections: z.array(menuSectionSchema),
})

export async function generateMenuFromImage(req, res) {
  const menuImage = req.file; // Assuming you're using a middleware like multer to handle file uploads

  if (!menuImage) {
    return res.status(400).json({ success: false, error: "No image provided." });
  }

  try {
    const { object: menuObject } = await generateObject({
      model: openai("gpt-4o"),
      schema: fullMenuSchema,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analiza esta imagen de un menú. Extrae el nombre del negocio, una descripción corta, y todas las secciones con sus respectivos productos. Para cada sección, genera un título, una descripción y un ícono de Iconify relevante. Para cada producto, extrae su nombre, descripción y precio si están disponibles. Estructura toda la información en el formato JSON solicitado, asegurándote de que cumple estrictamente con el esquema.",
            },
            { type: "image", image: await menuImage.buffer },
          ],
        },
      ],
    });

    res.json({ success: true, menu: menuObject });
  } catch (error) {
    console.error("Error generating menu from image:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    res.status(500).json({ success: false, error: `Failed to generate menu from image with AI. Details: ${errorMessage}` });
  }
}

export async function translateContent(req, res) {
  try {
    const { texts, targetLanguage, sourceLanguage = 'es' } = req.body;

    // Validación de entrada
    if (texts === undefined || texts === null) {
      return res.status(400).json({ 
        success: false, 
        error: "texts parameter is required" 
      });
    }

    if (!targetLanguage) {
      return res.status(400).json({ 
        success: false, 
        error: "targetLanguage parameter is required" 
      });
    }

    // Validar que targetLanguage sea un código de idioma válido
    const validLanguageCodes = ['en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ko', 'ar', 'ru', 'hi', 'nl', 'sv', 'no', 'da', 'fi', 'pl', 'tr', 'cs', 'sk', 'hu', 'ro', 'bg', 'hr', 'sl', 'et', 'lv', 'lt', 'mt', 'ga', 'cy', 'eu', 'ca', 'gl', 'th', 'vi', 'id', 'ms', 'tl', 'sw', 'zu', 'xh', 'af', 'am', 'he', 'ur', 'bn', 'gu', 'kn', 'ml', 'mr', 'ne', 'pa', 'si', 'ta', 'te'];
    
    if (!validLanguageCodes.includes(targetLanguage)) {
      return res.status(400).json({ 
        success: false, 
        error: `Invalid target language code: ${targetLanguage}` 
      });
    }

    // Usar la nueva función translateAny que es completamente automática
    const result = await translateAny(texts, targetLanguage, sourceLanguage);

    if (result.success) {
      // Mantener compatibilidad con versiones anteriores
      const response = {
        success: true,
        targetLanguage,
        sourceLanguage,
        ...result
      };

      // Para compatibilidad con frontend que espera formatos específicos
      if (typeof texts === 'string') {
        response.translatedText = result.translatedData;
      } else if (Array.isArray(texts)) {
        response.translations = result.translations || result.translatedData?.map((text, index) => ({
          originalText: texts[index],
          translatedText: text
        }));
      } else {
        response.translatedObject = result.translatedData;
      }

      res.json(response);
    } else {
      res.status(500).json(result);
    }

  } catch (error) {
    console.error("Error in translateContent:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    res.status(500).json({ 
      success: false, 
      error: `Translation failed. Details: ${errorMessage}` 
    });
  }
}

