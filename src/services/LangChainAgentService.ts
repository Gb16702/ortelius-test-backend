import { ChatOpenAI } from "@langchain/openai";
import { AI_CONFIG, RESPONSE_CODES } from "@config/ai";
import LanguageService  from "./LanguageService";
import StorageService from "./StorageService";
import ContextManager from "./ContextManager";

export interface AIResponse {
  code: string;
  message: string;
}

export class LangChainAgentService {
  private maritimeLLM: ChatOpenAI;

  constructor() {
    this.maritimeLLM = new ChatOpenAI({
      model: AI_CONFIG.OPENAI_MODEL,
      temperature: AI_CONFIG.QUERY_TEMPERATURE,
      openAIApiKey: process.env.OPENAI_API_KEY,
    });
  }

  public async translateMessage(message: string, languageCode: string): Promise<string> {
    return await LanguageService.translateMessage(message, languageCode);
  }

  private async analyzeMaritimeQuery(userPrompt: string, languageCode: string): Promise<AIResponse> {
    const locations = await ContextManager.extractLocations(userPrompt);

    let foundSpaces = false;
    let destinationSpaces: any[] = [];

    if (locations.destination) {
      destinationSpaces = await StorageService.findSpacesByLocation(locations.destination);

      if (destinationSpaces.length > 0) {
        foundSpaces = true;
      }
    }

    if (!foundSpaces && locations.destination) {
      const shippingResponse = await this.maritimeLLM.invoke([
        {
          role: "system",
          content: `
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
          `,
        },
        { role: "user", content: userPrompt },
      ]);

      const noSpacesMsg = await LanguageService.translateNoSpacesFound(locations.destination, languageCode);

      return {
        code: RESPONSE_CODES.NO_STORAGE_SPACES,
        message: noSpacesMsg + "\n\n" + shippingResponse.content,
      };
    }

    let storageInfo = "";
    if (foundSpaces && destinationSpaces.length > 0) {
      storageInfo = StorageService.formatStorageSpaces(destinationSpaces);
    }

    const maritimeResponse = await this.maritimeLLM.invoke([
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
${storageInfo ? "Storage information at destination:\n" + storageInfo : ""}
        `,
      },
    ]);

    return {
      code: RESPONSE_CODES.SUCCESS,
      message: maritimeResponse.content as string,
    };
  }

  public async searchSpacesWithAI(
    conversationSoFar: string,
    userPrompt: string,
    languageCode: string = AI_CONFIG.DEFAULT_LANGUAGE
  ): Promise<AIResponse> {
    try {
      const label = await ContextManager.classifyMessage(conversationSoFar);

      switch (label) {
        case "GREETING": {
          const greetingMsg = await this.translateMessage(
            "Bonjour, comment puis-je vous aider dans le domaine maritime ?",
            languageCode
          );
          return { code: RESPONSE_CODES.SUCCESS, message: greetingMsg };
        }
        case "FAREWELL": {
          const farewellMsg = await this.translateMessage(
            "Au revoir !",
            languageCode
          );
          return { code: RESPONSE_CODES.SUCCESS, message: farewellMsg };
        }
        case "OFF_TOPIC": {
          const offTopicMsg = await this.translateMessage(
            "Je suis spécialisé dans la logistique maritime. Comment puis-je vous aider ?",
            languageCode
          );
          return { code: RESPONSE_CODES.SUCCESS, message: offTopicMsg };
        }
        case "LOGISTICS":
          break;
        default: {
          const fallbackMsg = await this.translateMessage(
            "Pouvez-vous préciser votre demande en lien avec la logistique maritime ?",
            languageCode
          );
          return { code: RESPONSE_CODES.SUCCESS, message: fallbackMsg };
        }
      }

      const logisticsIntent = await ContextManager.detectLogisticsIntent(userPrompt);
      if (logisticsIntent.isLogisticsQuery) {
        return await this.analyzeMaritimeQuery(userPrompt, languageCode);
      }

      let potentialLocation: string | null = null;
      try {
        const locations = await ContextManager.extractLocations(userPrompt);
        potentialLocation = locations.destination || locations.origin;

        if (potentialLocation) {
          const directSpaces = await StorageService.findSpacesByLocation(potentialLocation);

          if (directSpaces.length > 0) {
            const formattedSpaces = StorageService.formatStorageSpaces(directSpaces);
            return { code: RESPONSE_CODES.SUCCESS, message: formattedSpaces };
          } else {
            const noSpacesMsg = await LanguageService.translateNoSpacesFound(potentialLocation, languageCode);
            return { code: RESPONSE_CODES.NO_STORAGE_SPACES, message: noSpacesMsg };
          }
        }
      } catch (error) {
        console.error("Error extracting location directly:", error);
      }

      const query = await ContextManager.generateMongoQuery(userPrompt);

      if (!query) {
        const notUnderstoodMsg = await this.translateMessage(
          "I didn't understand your request. Could you provide more details?",
          languageCode
        );
        return { code: RESPONSE_CODES.ERROR, message: notUnderstoodMsg };
      }

      if (query._needMoreInfo) {
        const needMoreInfoMsg = await this.translateMessage(
          "**I need more details.** What size, location, or features are you looking for?",
          languageCode
        );
        return { code: RESPONSE_CODES.NEED_MORE_INFO, message: needMoreInfoMsg };
      }

      const results = await StorageService.findSpacesByQuery(query);

      if (results.length === 0) {
        const noMatchingMsg = await this.translateMessage(
          "**No matching storage spaces found in our database.**",
          languageCode
        );
        return { code: RESPONSE_CODES.NO_MATCHING_SPACES, message: noMatchingMsg };
      }

      const formattedResults = StorageService.formatStorageSpaces(results);
      return { code: RESPONSE_CODES.SUCCESS, message: formattedResults };

    } catch (error) {
      console.error("Error in searchSpacesWithAI:", error);

      const errorMsg = await this.translateMessage(
        "An error occurred while processing your request. Please try again later.",
        languageCode
      );

      return { code: RESPONSE_CODES.ERROR, message: errorMsg };
    }
  }
}


export default new LangChainAgentService();