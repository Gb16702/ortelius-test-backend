import { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/AppError";
import LangChainAgentService from "../services/LangChainAgentService";
import { ConversationBufferMemoryService } from "../services/ConversationBufferMemory";
import { UserRepository } from "../repository/UserRepository";
import LanguageService from "../services/LanguageService";
import { AI_CONFIG, RESPONSE_CODES } from "../config/ai";

interface SessionState {
  lastResponseCode?: string;
  lastQueryTimestamp?: number;
}

class ChatController {
  private conversationMemory: ConversationBufferMemoryService;
  private userRepository: UserRepository;
  private sessionStates: Map<string, SessionState>;

  constructor() {
    this.conversationMemory = new ConversationBufferMemoryService();
    this.userRepository = new UserRepository();
    this.sessionStates = new Map<string, SessionState>();
  }

  public async handleChat(req: Request, res: Response, next: NextFunction) {
    const { prompt, sessionId } = req.body;

    if (!sessionId) return next(AppError.badRequest("Session ID is required"));
    if (!prompt || prompt.trim().length === 0) return next(AppError.badRequest("Prompt cannot be empty"));
    if (prompt.length > AI_CONFIG.MAX_PROMPT_LENGTH) return next(AppError.badRequest("Prompt is too long"));

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    try {
      const user = await this.userRepository.findById(sessionId);
      if (user.credits < AI_CONFIG.CREDITS_PER_REQUEST) {
        return next(AppError.forbidden("Not enough credits"));
      }
      await this.userRepository.deductCredits(sessionId, AI_CONFIG.CREDITS_PER_REQUEST);

      if (!this.sessionStates.has(sessionId)) {
        this.sessionStates.set(sessionId, {});
      }
      const sessionState = this.sessionStates.get(sessionId)!;

      if (sessionState.lastResponseCode === RESPONSE_CODES.NEED_MORE_INFO) {
        await this.handleFollowupToNeedMoreInfo(prompt, res, user, sessionState);
        return;
      }

      const history = await this.conversationMemory.getHistory();
      const conversationSoFar = history ? `${history}\nUser: ${prompt}` : prompt;

      const languageCode = await LanguageService.detectLanguage(prompt);
      console.log(`Query language detected: ${languageCode}`);

      const aiResponse = await LangChainAgentService.searchSpacesWithAI(conversationSoFar, prompt, languageCode);
      await this.conversationMemory.addTurn(prompt, aiResponse.message);

      if (aiResponse.code === RESPONSE_CODES.NEED_MORE_INFO) {
        sessionState.lastResponseCode = RESPONSE_CODES.NEED_MORE_INFO;
      }

      const directResponseCodes = [
        RESPONSE_CODES.NO_STORAGE_SPACES,
        RESPONSE_CODES.NO_MATCHING_SPACES,
        RESPONSE_CODES.NEED_MORE_INFO,
        RESPONSE_CODES.ERROR,
      ];

      if (directResponseCodes.includes(aiResponse.code)) {
        console.log(`Direct response with code: ${aiResponse.code}`);
        await this.sendDirectResponse(aiResponse.message, res);
        this.sendCreditsUpdate(user.credits, res);
        this.endStream(res);
        return;
      }

      const systemPrompt = AI_CONFIG.BASE_SYSTEM_PROMPT + LanguageService.getLanguageInstructions(languageCode);
      await this.streamOpenAIResponse(systemPrompt, prompt, aiResponse.message, res, user, next);
    } catch (error) {
      console.error("Error in handleChat:", error);
      if (!res.writableEnded) {
        this.endStream(res);
      }
      return next(AppError.internal("Error processing request"));
    }
  }

  private async handleFollowupToNeedMoreInfo(prompt: string, res: Response, user: any, sessionState: SessionState) {
    sessionState.lastResponseCode = undefined;
    const directMessage = await LangChainAgentService.translateMessage(
      `Compris. Vous n'avez pas de préférence pour la taille.`,
      AI_CONFIG.DEFAULT_LANGUAGE
    );
    await this.conversationMemory.addTurn(prompt, directMessage);
    await this.sendDirectResponse(directMessage, res);
    this.sendCreditsUpdate(user.credits, res);
    this.endStream(res);
  }

  private async sendDirectResponse(message: string, res: Response) {
    const chunks = message.split(" ");
    for (const chunk of chunks) {
      const dataObj = {
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: AI_CONFIG.CHAT_MODEL,
        choices: [{ index: 0, delta: { content: chunk + " " }, finish_reason: null }],
      };
      res.write(`data: ${JSON.stringify(dataObj)}\n\n`);
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    const finalDataObj = {
      id: `chatcmpl-${Date.now()}`,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: AI_CONFIG.CHAT_MODEL,
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    };
    res.write(`data: ${JSON.stringify(finalDataObj)}\n\n`);
  }

  private sendCreditsUpdate(credits: number, res: Response) {
    const creditsUpdateEvent = JSON.stringify({ type: "creditsUpdate", credits });
    res.write(`data: ${creditsUpdateEvent}\n\n`);
  }

  private endStream(res: Response) {
    res.write("data: [DONE]\n\n");
    res.end();
  }

  private async streamOpenAIResponse(
    systemPrompt: string,
    userPrompt: string,
    assistantContext: string,
    res: Response,
    user: any,
    next: NextFunction
  ) {
    try {
      const response = await fetch(AI_CONFIG.OPENAI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: AI_CONFIG.CHAT_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
            { role: "assistant", content: assistantContext },
          ],
          temperature: 0.2,
          stream: true,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`OpenAI API Error: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data:")) {
            const json = line.replace("data:", "").trim();
            if (json === "[DONE]") continue;

            try {
              if (!json.startsWith("{") || !json.endsWith("}")) continue;
              JSON.parse(json);
              res.write(`data: ${json}\n\n`);
            } catch (error) {
              console.error("Error parsing JSON:", error);
            }
          }
        }
      }

      this.sendCreditsUpdate(user.credits, res);
      this.endStream(res);
    } catch (error) {
      console.error("Error in streamOpenAIResponse:", error);
      if (!res.writableEnded) {
        this.endStream(res);
      }
      next(AppError.internal("Error processing request"));
    }
  }
}

export default new ChatController();
