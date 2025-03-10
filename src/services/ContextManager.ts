import { ChatOpenAI } from "@langchain/openai";
import { CacheService } from "./CacheService";
import { MemoryStorage } from "node-ts-cache-storage-memory";
import { AI_CONFIG } from "@config/ai";

export class ContextManager {
  private intentLLM: ChatOpenAI;
  private queryLLM: ChatOpenAI;
  private systemPromptCache: CacheService<string>;
  private intentCache: CacheService<any>;
  private mongoQueryCache: CacheService<any>;
  private classificationCache: CacheService<string>;

  constructor() {
    this.intentLLM = this.createLLM(AI_CONFIG.INTENT_TEMPERATURE);
    this.queryLLM = this.createLLM(AI_CONFIG.QUERY_TEMPERATURE);

    this.systemPromptCache = new CacheService<string>(new MemoryStorage(), AI_CONFIG.SYSTEM_PROMPT_CACHE_TTL);

    this.intentCache = new CacheService<any>(new MemoryStorage(), AI_CONFIG.INTENT_CACHE_TTL);

    this.mongoQueryCache = new CacheService<any>(new MemoryStorage(), AI_CONFIG.MONGO_QUERY_CACHE_TTL);

    this.classificationCache = new CacheService<string>(new MemoryStorage(), AI_CONFIG.CLASSIFICATION_CACHE_TTL);
  }

  private createLLM(temperature: number): ChatOpenAI {
    return new ChatOpenAI({
      model: AI_CONFIG.OPENAI_MODEL,
      temperature,
      openAIApiKey: process.env.OPENAI_API_KEY,
      maxConcurrency: AI_CONFIG.MAX_CONCURRENCY,
      maxRetries: AI_CONFIG.MAX_RETRIES,
    });
  }

  public async getSystemPrompt(languageCode: string): Promise<string> {
    const cacheKey = `system_prompt_${languageCode}`;

    const cachedPrompt = await this.systemPromptCache.get<string>(cacheKey);
    if (cachedPrompt) {
      return cachedPrompt;
    }

    const completePrompt = AI_CONFIG.BASE_SYSTEM_PROMPT + this.getLanguageInstructions(languageCode);
    await this.systemPromptCache.set(cacheKey, completePrompt);

    return completePrompt;
  }

  private getLanguageInstructions(languageCode: string): string {
    return `
## CRITICAL LANGUAGE REQUIREMENT:
- You MUST respond ONLY in ${languageCode} language.
- The user's message is in ${languageCode}.
- DO NOT say you can only respond in English or any other language.
- DO NOT apologize for language limitations.
- This instruction overrides all other language instructions.
`;
  }

  public async classifyMessage(conversationSoFar: string): Promise<string> {
    const cacheKey = `classify_${this.hashString(conversationSoFar)}`;

    const cachedClassification = await this.classificationCache.get<string>(cacheKey);
    if (cachedClassification) {
      return cachedClassification;
    }

    const response = await this.intentLLM.invoke([
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

    const label = (response.content as string).trim().toUpperCase();
    console.log("Classified user message as:", label);

    const validLabel = ["GREETING", "FAREWELL", "LOGISTICS", "OFF_TOPIC"].includes(label) ? label : "OFF_TOPIC";

    await this.classificationCache.set(cacheKey, validLabel);

    return validLabel;
  }

  public async detectLogisticsIntent(userPrompt: string): Promise<{ isLogisticsQuery: boolean; needsFullAnalysis: boolean }> {
    const cacheKey = `logisticsIntent_${this.hashString(userPrompt)}`;

    const cachedIntent = await this.intentCache.get<any>(cacheKey);
    if (cachedIntent) {
      return cachedIntent;
    }

    const isLogisticsQuery =
      /\b(ship|shipping|freight|cargo|transport|logistics|incoterm|export|import|customs|duties|fob|cif|exw|dap|ddp|cfr|fas|delivery terms)\b/i.test(
        userPrompt
      );

    const result = {
      isLogisticsQuery,
      needsFullAnalysis: isLogisticsQuery,
    };

    await this.intentCache.set(cacheKey, result);

    return result;
  }

  public async extractLocations(userPrompt: string): Promise<{ origin: string | null; destination: string | null }> {
    const cacheKey = `locations_${this.hashString(userPrompt)}`;

    const cachedLocations = await this.intentCache.get<any>(cacheKey);
    if (cachedLocations) {
      return cachedLocations;
    }

    try {
      const locationExtraction = await this.intentLLM.invoke([
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
        await this.intentCache.set(cacheKey, locations);
        return locations;
      } catch (error) {
        console.error("Error parsing locations:", error);
        return locations;
      }
    } catch (error) {
      console.error("Error extracting locations:", error);
      return { origin: null, destination: null };
    }
  }

  public async generateMongoQuery(userPrompt: string): Promise<any | null> {
    const cacheKey = `mongoQuery_${this.hashString(userPrompt)}`;

    const cachedQuery = await this.mongoQueryCache.get<any>(cacheKey);
    if (cachedQuery) {
      return cachedQuery;
    }

    try {
      const response = await this.queryLLM.invoke([
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

        await this.mongoQueryCache.set(cacheKey, query);
        return query;
      } catch (error) {
        console.error("Error parsing MongoDB query:", error);
        return null;
      }
    } catch (error) {
      console.error("Error generating MongoDB query:", error);
      return null;
    }
  }

  private hashString(string: string): string {
    let hash = 0;
    for (let i = 0; i < string.length; i++) {
      const char = string.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return hash.toString(16);
  }
}

export default new ContextManager();
