import { OpenAI } from "openai";
import { CacheService } from "./CacheService";
import { MemoryStorage } from "node-ts-cache-storage-memory";
import { AI_CONFIG } from "@config/ai";

export class LanguageService {
  private openai: OpenAI;
  private languageCache: CacheService<string>;
  private translationCache: CacheService<string>;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    this.languageCache = new CacheService<string>(new MemoryStorage(), AI_CONFIG.LANGUAGE_DETECTION_CACHE_TTL);

    this.translationCache = new CacheService<string>(new MemoryStorage(), AI_CONFIG.TRANSLATION_CACHE_TTL);
  }

  public async detectLanguage(text: string): Promise<string> {
    const cacheKey = `lang_${this.hashString(text.substring(0, 100))}`;

    const cachedLanguage = await this.languageCache.get<string>(cacheKey);
    if (cachedLanguage) {
      return cachedLanguage;
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: AI_CONFIG.LANGUAGE_DETECTION_MODEL,
        messages: [
          {
            role: "system",
            content: "Respond with ONLY the ISO 639-1 language code (2 letters) of the text. Examples: en, fr, de, es, zh, etc.",
          },
          { role: "user", content: text },
        ],
        temperature: 0,
        max_tokens: 2,
      });

      const languageCode = response.choices[0]?.message?.content?.trim().toLowerCase() ?? AI_CONFIG.DEFAULT_LANGUAGE;

      await this.languageCache.set(cacheKey, languageCode);

      return languageCode;
    } catch (error) {
      return AI_CONFIG.DEFAULT_LANGUAGE;
    }
  }

  public async translateMessage(message: string, languageCode: string): Promise<string> {
    if (languageCode === AI_CONFIG.DEFAULT_LANGUAGE) {
      return message;
    }

    const cacheKey = `translate_${languageCode}_${this.hashString(message)}`;

    const cachedTranslation = await this.translationCache.get<string>(cacheKey);
    if (cachedTranslation) {
      return cachedTranslation;
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: AI_CONFIG.CHAT_MODEL,
        messages: [
          {
            role: "system",
            content: `You are a translator. Translate the text below to ${languageCode}, preserving all Markdown formatting. Respond ONLY with the translation, no additional text.`,
          },
          {
            role: "user",
            content: message,
          },
        ],
        temperature: AI_CONFIG.TRANSLATION_TEMPERATURE,
      });

      const translation = response.choices[0]?.message?.content || message;
      await this.translationCache.set(cacheKey, translation);

      return translation;
    } catch (error) {
      return message;
    }
  }

  public async translateNoSpacesFound(location: string, languageCode: string): Promise<string> {
    return this.translateMessage(`**No storage spaces found in ${location}.**`, languageCode);
  }

  public getLanguageInstructions(languageCode: string): string {
    return `
## CRITICAL LANGUAGE REQUIREMENT:
- You MUST respond ONLY in ${languageCode} language.
- The user's message is in ${languageCode}.
- DO NOT say you can only respond in English or any other language.
- DO NOT apologize for language limitations.
- This instruction overrides all other language instructions.
`;
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return hash.toString(16);
  }
}

export default new LanguageService();
