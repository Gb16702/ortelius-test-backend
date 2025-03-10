import { ChatOpenAI } from "@langchain/openai";
import { Space } from "../models/storageSchema";
import { CacheContainer } from "node-ts-cache";
import { MemoryStorage } from "node-ts-cache-storage-memory";
import dotenv from "dotenv";
import assert from "assert";

dotenv.config();

const OPENAI_MODEL = "gpt-4-turbo";
const DEFAULT_TEMPERATURE = 0.5;
const QUERY_LIMIT = 3;
const RESULTS_CACHE_TTL = 3600;
const INTENT_CACHE_TTL = 1800;
const MONGO_QUERY_CACHE_TTL = 3600;
const DEFAULT_LANGUAGE = "en";

const RESPONSE_CODES = {
  SUCCESS: "SUCCESS",
  NO_STORAGE_SPACES: "NO_STORAGE_SPACES",
  NO_MATCHING_SPACES: "NO_MATCHING_SPACES",
  NEED_MORE_INFO: "NEED_MORE_INFO",
  ERROR: "ERROR",
};

export interface AIResponse {
  code: string;
  message: string;
}

const resultsCache = new CacheContainer(new MemoryStorage());
const intentCache = new CacheContainer(new MemoryStorage());
const mongoQueryCache = new CacheContainer(new MemoryStorage());

function createLLM(temperature = DEFAULT_TEMPERATURE) {
  return new ChatOpenAI({
    model: OPENAI_MODEL,
    temperature,
    openAIApiKey: process.env.OPENAI_API_KEY,
    maxConcurrency: 5,
    maxRetries: 3,
  });
}
const llmForIntent = createLLM(0.2);
const llmForQueries = createLLM(0.5);

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash.toString(16);
}

/**
 * Classifie le message en tenant compte de l'historique complet de la conversation.
 * conversationSoFar doit contenir l'historique complet incluant le dernier message.
 */
export async function classifyUserMessage(conversationSoFar: string): Promise<string> {
  const response = await llmForIntent.invoke([
    {
      role: "system",
      content: `
You are a text classifier.
You see the entire conversation so far, including the last user message.
You MUST respond with exactly one label from this list:
- GREETING
- FAREWELL
- LOGISTICS
- OFF_TOPIC

Do not add anything else.

Conversation so far:
${conversationSoFar}
      `,
    },
  ]);

  let rawContent: string;
  if (Array.isArray(response.content)) {
    rawContent = response.content.join(" ");
  } else {
    rawContent = String(response.content || "");
  }
  assert(typeof rawContent === "string", "Expected response.content to be a string");

  const label = rawContent.trim().toUpperCase();
  console.log("Classified user message as:", label);
  if (!["GREETING", "FAREWELL", "LOGISTICS", "OFF_TOPIC"].includes(label)) {
    return "OFF_TOPIC";
  }
  return label;
}

export async function translateMessage(message: string, languageCode: string): Promise<string> {
  if (languageCode === "en") {
    return message;
  }
  const response = await llmForQueries.invoke([
    {
      role: "system",
      content: `
You are a translator. You must respond exclusively in ${languageCode},
with no explanation. Translate the text below to ${languageCode}, respecting any Markdown:

${message}
      `,
    },
  ]);
  return response.content as string;
}

async function findRelevantStorageSpaces(location: string) {
  if (!location || location.trim().length === 0) {
    return [];
  }
  const normalizedLocation = location.trim().toLowerCase();
  const cacheKey = `storageSpaces_${normalizedLocation}`;

  const cachedResults = await resultsCache.getItem<any[]>(cacheKey);
  if (cachedResults) {
    return cachedResults;
  }
  try {
    const query = { "location.address": { $regex: normalizedLocation, $options: "i" } };
    const spaces = await Space.find(query).limit(QUERY_LIMIT).lean();
    console.log(`Found ${spaces.length} spaces matching '${normalizedLocation}' in location.address`);
    await resultsCache.setItem(cacheKey, spaces, { ttl: RESULTS_CACHE_TTL });
    return spaces;
  } catch (error) {
    console.error("Error finding storage spaces:", error);
    return [];
  }
}

async function translateNoSpacesFound(location: string, languageCode: string): Promise<string> {
  if (languageCode === "en") {
    return `**No storage spaces found in ${location}.**`;
  }
  const response = await llmForQueries.invoke([
    {
      role: "system",
      content: `
Tu es un traducteur. Tu dois répondre **exclusivement** en ${languageCode}
sans aucune autre explication.

Traduis la phrase suivante en ${languageCode},
en respectant la mise en forme Markdown :

No storage spaces found in ${location}.
      `,
    },
  ]);
  return response.content as string;
}

async function generateNeedMoreInfoMessage(languageCode: string): Promise<string> {
  const response = await llmForQueries.invoke([
    {
      role: "system",
      content: `
Tu es un agent de conversation logistique.
Tu dois répondre uniquement en ${languageCode}.
Reste concis et demande les informations manquantes (taille, localisation, services, etc.).
Formate ta réponse en Markdown.
N'écris aucune autre explication en dehors de la réponse finale.
      `,
    },
    {
      role: "user",
      content: `L'utilisateur a fait une requête trop vague,
on manque notamment la taille, l'emplacement,
et/ou d'autres caractéristiques pour trouver un espace de stockage.`,
    },
  ]);
  return response.content as string;
}

async function extractLocations(userPrompt: string) {
  const cacheKey = `locations_${hashString(userPrompt)}`;
  const cachedLocations = await intentCache.getItem<any>(cacheKey);
  if (cachedLocations) {
    return cachedLocations;
  }
  try {
    const locationExtraction = await llmForIntent.invoke([
      {
        role: "system",
        content: `
Extract origin and destination locations from the shipping query.
Return ONLY a JSON object with this structure:
{
  "origin": string | null,
  "destination": string | null
}

Example:
Query: "I need to ship auto parts from Shanghai to Hamburg"
Response: {"origin": "Shanghai", "destination": "Hamburg"}

If a location isn't specified, return null for that field.
        `,
      },
      { role: "user", content: userPrompt },
    ]);
    let locations = { origin: null, destination: null };
    try {
      locations = JSON.parse(locationExtraction.content as string);
      await intentCache.setItem(cacheKey, locations, { ttl: INTENT_CACHE_TTL });
      return locations;
    } catch (error) {
      return locations;
    }
  } catch (error) {
    return { origin: null, destination: null };
  }
}

async function detectLogisticsIntent(userPrompt: string) {
  const cacheKey = `logisticsIntent_${hashString(userPrompt)}`;
  const cachedIntent = await intentCache.getItem<any>(cacheKey);
  if (cachedIntent) {
    return cachedIntent;
  }
  const isLogisticsQuery =
    /\b(ship|shipping|freight|cargo|transport|logistics|incoterm|export|import|customs|duties|fob|cif|exw|dap|ddp|cfr|fas|delivery terms)\b/i.test(
      userPrompt
    );
  const result = { isLogisticsQuery, needsFullAnalysis: isLogisticsQuery };
  await intentCache.setItem(cacheKey, result, { ttl: INTENT_CACHE_TTL });
  return result;
}

async function generateMongoQuery(userPrompt: string) {
  const cacheKey = `mongoQuery_${hashString(userPrompt)}`;
  const cachedQuery = await mongoQueryCache.getItem<any>(cacheKey);
  if (cachedQuery) {
    return cachedQuery;
  }
  try {
    const response = await llmForQueries.invoke([
      {
        role: "system",
        content: `
You are an AI assistant specialized in logistics and storage management.
Your task is to convert natural language queries into MongoDB queries.

Return only a valid JSON object, with no explanations.
If the query is too vague, add the field "_needMoreInfo": true.
        `,
      },
      { role: "user", content: userPrompt },
    ]);
    try {
      let query = JSON.parse(response.content as string);
      if (query && query.space_type && typeof query.space_type === "string") {
        query.space_type = { $regex: query.space_type, $options: "i" };
      }
      await mongoQueryCache.setItem(cacheKey, query, { ttl: MONGO_QUERY_CACHE_TTL });
      return query;
    } catch (error) {
      return null;
    }
  } catch (error) {
    return null;
  }
}

async function analyzeMaritimeQuery(userPrompt: string, languageCode: string): Promise<AIResponse> {
  const locations = await extractLocations(userPrompt);
  let foundSpaces = false;
  let destinationSpaces: any[] = [];
  if (locations.destination) {
    destinationSpaces = await findRelevantStorageSpaces(locations.destination);
    if (destinationSpaces.length > 0) {
      foundSpaces = true;
    }
  }
  if (!foundSpaces && locations.destination) {
    const shippingPrompt = `
You are a specialized maritime logistics expert.

CRITICAL INSTRUCTION: You MUST respond ONLY in ${languageCode} language.
DO NOT apologize for language limitations.
DO NOT say you can only respond in English.

When answering shipping queries:
1. Focus ONLY on maritime/sea freight options
2. Provide brief information about container options, transit times, and routes
3. Recommend appropriate maritime Incoterms (FOB, CFR, CIF, FAS)
4. Keep your response concise and professional

DO NOT mention storage spaces or availability.

Query: ${userPrompt}
    `;
    const shippingInfo = await llmForQueries.invoke([
      { role: "system", content: shippingPrompt },
      { role: "user", content: userPrompt },
    ]);
    const noSpacesTranslated = await translateNoSpacesFound(locations.destination, languageCode);
    return {
      code: RESPONSE_CODES.NO_STORAGE_SPACES,
      message: noSpacesTranslated + "\n\n" + (shippingInfo.content as string),
    };
  }
  let storageInfo = "";
  if (foundSpaces && destinationSpaces.length > 0) {
    storageInfo = "## Available Storage Facilities\n\n";
    destinationSpaces.forEach((space: any) => {
      storageInfo += `- **${space.name}** (${space.space_in_square_m}m²) - ${space.location?.address || ""}\n`;
      if (space.services && space.services.length > 0) {
        storageInfo += `  - Services: ${space.services.join(", ")}\n`;
      }
      if (space.categories && space.categories.length > 0) {
        storageInfo += `  - Suitable for: ${space.categories.join(", ")}\n`;
      }
    });
  }
  const maritimeResponse = await llmForQueries.invoke([
    {
      role: "system",
      content: `
You are a specialized maritime logistics expert. Your responses should be concise, practical, and focused on maritime shipping.
IMPORTANT: You MUST respond in ${languageCode} language only.

When answering shipping queries:
1. Focus ONLY on maritime/sea freight options
2. Provide brief, practical information about maritime routes
3. Recommend appropriate maritime Incoterms
4. Keep responses concise and business-oriented

Format your response in professional Markdown with:
- Clear, brief sections
- Bullet points for container options and Incoterms
- Bold text for key maritime terms
      `,
    },
    {
      role: "user",
      content: `
Query: ${userPrompt}
${storageInfo ? "Storage information at destination:" + storageInfo : ""}
      `,
    },
  ]);
  return {
    code: RESPONSE_CODES.SUCCESS,
    message: maritimeResponse.content as string,
  };
}

export async function searchSpacesWithAI(
  conversationSoFar: string,
  userPrompt: string,
  languageCode: string = DEFAULT_LANGUAGE
): Promise<AIResponse> {
  try {
    const label = await classifyUserMessage(conversationSoFar);
    switch (label) {
      case "GREETING": {
        const greetingMsg = await translateMessage("Bonjour, comment puis-je vous aider dans le domaine maritime ?", languageCode);
        return { code: RESPONSE_CODES.SUCCESS, message: greetingMsg };
      }
      case "FAREWELL": {
        const farewellMsg = await translateMessage("Au revoir !", languageCode);
        return { code: RESPONSE_CODES.SUCCESS, message: farewellMsg };
      }
      case "OFF_TOPIC": {
        const offTopicMsg = await translateMessage("Je suis spécialisé dans la logistique maritime. Comment puis-je vous aider ?", languageCode);
        return { code: RESPONSE_CODES.SUCCESS, message: offTopicMsg };
      }
      case "LOGISTICS":
        break;
      default: {
        const fallbackMsg = await translateMessage("Pouvez-vous préciser votre demande en lien avec la logistique maritime ?", languageCode);
        return { code: RESPONSE_CODES.SUCCESS, message: fallbackMsg };
      }
    }
    const logisticsIntent = await detectLogisticsIntent(userPrompt);
    if (logisticsIntent.isLogisticsQuery) {
      const maritimeResp = await analyzeMaritimeQuery(userPrompt, languageCode);
      return maritimeResp;
    }
    let potentialLocation: string | null = null;
    try {
      const locations = await extractLocations(userPrompt);
      potentialLocation = locations.destination || locations.origin;
      if (potentialLocation) {
        const directSpaces = await findRelevantStorageSpaces(potentialLocation);
        if (directSpaces.length > 0) {
          let responseText = "**Here are available storage spaces:**\n\n";
          for (const space of directSpaces) {
            responseText += `- **${space.name}**, **${space.space_in_square_m}m²**, located at **${space.location?.address || ""}**\n`;
            if (space.services?.length) {
              responseText += `  - Services: ${space.services.join(", ")}\n`;
            }
            if (space.categories?.length) {
              responseText += `  - Suitable for: ${space.categories.join(", ")}\n`;
            }
          }
          return { code: RESPONSE_CODES.SUCCESS, message: responseText };
        } else {
          const noSpacesMsg = await translateNoSpacesFound(potentialLocation, languageCode);
          return { code: RESPONSE_CODES.NO_STORAGE_SPACES, message: noSpacesMsg };
        }
      }
    } catch (error) {
      console.error("Error extracting location directly:", error);
      potentialLocation = null;
    }
    const query = await generateMongoQuery(userPrompt);
    if (!query) {
      const notUnderstoodMsg = await translateMessage("I didn't understand your request. Could you provide more details?", languageCode);
      return { code: RESPONSE_CODES.ERROR, message: notUnderstoodMsg };
    }
    if (query._needMoreInfo) {
      const needMoreInfo = await generateNeedMoreInfoMessage(languageCode);
      return { code: RESPONSE_CODES.NEED_MORE_INFO, message: needMoreInfo };
    }
    const results = await Space.find(query).limit(5).lean();
    if (results.length === 0) {
      const noSpacesMsg = await translateNoSpacesFound("the specified location or criteria", languageCode);
      return { code: RESPONSE_CODES.NO_MATCHING_SPACES, message: noSpacesMsg };
    }
    let responseText = "**Here are available storage spaces:**\n\n";
    for (const space of results) {
      responseText += `- **${space.name}**, **${space.space_in_square_m}m²**, located at **${space.location?.address || ""}**\n`;
      if (space.services?.length) {
        responseText += `  - Services: ${space.services.join(", ")}\n`;
      }
      if (space.categories?.length) {
        responseText += `  - Suitable for: ${space.categories.join(", ")}\n`;
      }
    }
    return { code: RESPONSE_CODES.SUCCESS, message: responseText };
  } catch (error) {
    console.error("Error in searchSpacesWithAI:", error);
    const errorMsg = await translateMessage("An error occurred while processing your request. Please try again later.", languageCode);
    return { code: RESPONSE_CODES.ERROR, message: errorMsg };
  }
}

export { RESPONSE_CODES };
