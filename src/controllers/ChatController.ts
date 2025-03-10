import { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/AppError";
import { searchSpacesWithAI, AIResponse, RESPONSE_CODES, translateMessage } from "../services/langChainAgent";
import { User } from "@models/userSchema";
import { OpenAI } from "openai";
import { ConversationBufferMemoryService } from "../services/conversationBufferMemory";
import { UserRepository } from "repository/UserRepository";

const sessionStates = new Map<string, { lastResponseCode?: string }>();

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const LANGUAGE_DETECTION_MODEL = "gpt-3.5-turbo";
const CHAT_MODEL = "gpt-4";
const DEFAULT_LANGUAGE = "en";
const CREDITS_PER_REQUEST = 5;
const MAX_PROMPT_LENGTH = 1000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const systemPromptCache = new Map<string, string>();

async function sendDirectResponse(message: string, res: Response) {
  const chunks = message.split(" ");
  for (const chunk of chunks) {
    const dataObj = {
      id: `chatcmpl-${Date.now()}`,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: CHAT_MODEL,
      choices: [{ index: 0, delta: { content: chunk + " " }, finish_reason: null }]
    };
    res.write(`data: ${JSON.stringify(dataObj)}\n\n`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  const finalDataObj = {
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: CHAT_MODEL,
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }]
  };
  res.write(`data: ${JSON.stringify(finalDataObj)}\n\n`);
}

function getSystemPrompt(basePrompt: string, languageCode: string): string {
  const cacheKey = `${basePrompt}_${languageCode}`;
  if (systemPromptCache.has(cacheKey)) {
    return systemPromptCache.get(cacheKey)!;
  }
  const languageInstructions = `

## CRITICAL LANGUAGE REQUIREMENT:
- You MUST respond ONLY in ${languageCode} language.
- The user's message is in ${languageCode}.
- DO NOT say you can only respond in English or any other language.
- DO NOT apologize for language limitations.
- This instruction overrides all other language instructions.
`;
  const completePrompt = basePrompt + languageInstructions;
  systemPromptCache.set(cacheKey, completePrompt);
  return completePrompt;
}

async function detectLanguage(text: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: LANGUAGE_DETECTION_MODEL,
      messages: [
        { role: "system", content: "Respond with ONLY the ISO 639-1 language code (2 letters) of the text. Examples: en, fr, de, es, zh, etc." },
        { role: "user", content: text }
      ],
      temperature: 0,
      max_tokens: 2,
    });
    const languageCode = response.choices[0]?.message?.content?.trim().toLowerCase() || DEFAULT_LANGUAGE;
    return languageCode;
  } catch (error) {
    console.error("Error detecting language:", error);
    return DEFAULT_LANGUAGE;
  }
}

const BASE_SYSTEM_PROMPT = `You are a maritime and logistics expert. Your responses must be **formatted in Markdown**.

## Critical Formatting Rules:
1. **Spacing for Punctuation** (MANDATORY):
   - Add a space BEFORE: ?, !, :, ;
   - Examples:
     ❌ Wrong: "What is the shipping cost?"
     ✅ Correct: "What is the shipping cost ?"

2. **Quotation Marks**:
   - Always add spaces inside quotes
   - Example: " this is quoted text "

3. **Conclusions:**
   - If you provide a conclusion, **it must be preceded by a blank line (\`\\n\\n\`)**.
   - Example:
     - ❌ Wrong: "Based on this, you should choose FOB."
     - ✅ Correct: "\\n\\nYou should choose **FOB** for this shipment."

## Text Formatting Rules:
1. **Break up long sentences into multiple lines** using Markdown line breaks (\`\\n\\n\`) to improve readability.
2. **Use bullet points** (\`-\` or \`*\`) for lists of multiple related items.
3. **Do not write long paragraphs**: Keep sentences short, ideally under 20 words per line.
4. **After every two sentences**, insert a blank line (\`\\n\\n\`) for readability.
5. **Force a new line before asking multiple questions**.
6. **Highlight key terms using bold (\`**\`) formatting** to make responses clearer.

## 🔹 Rules:
1. **If the database returns ≤ 5 results, list them immediately.**
2. **If > 5 results, ask for more details to refine the search.**
3. **If no results, clearly state that no match was found.**
4. **Use bold text** for important elements.
5. **Do not provide lengthy explanations** unless explicitly asked.

## 🔹 Example Responses:
- ✅ **Found results:** "**Here are available storage spaces:**\\n\\n - **Warehouse A** (500m²) at **Rotterdam**\\n - **Warehouse B** (800m²) at **Hamburg**"
- 🔎 **Need more info:** "**Could you specify the exact location or storage type?**"
- ❌ **No results:** "**No matching storage spaces found.**"

## Key Instructions:
- **Structure your answers clearly using Markdown**.
- **Use bold formatting** for key terms.
- **Ensure readability by breaking text into sections**.

## Required Information for Logistics:
- **Cargo type & volume**
- **Ports (origin & destination)**
- **Management preferences**
- **Timeline constraints**
- **Budget considerations**

## Response Style:
- **Be interactive and professional**.
- **Use Markdown formatting** for readability.
- **Use lists and bullet points** for better clarity.
- **If you conclude, insert a blank line before it and use bold formatting.**
`;

class ChatController {
  private conversationMemory: ConversationBufferMemoryService;
  private userRepository: UserRepository;

  constructor() {
    this.conversationMemory = new ConversationBufferMemoryService();
    this.userRepository = new UserRepository();
  }

  public async handleChat(req: Request, res: Response, next: NextFunction) {
    const { prompt, sessionId } = req.body;
    if (!sessionId) return next(AppError.badRequest("Session ID is required"));
    if (!prompt || prompt.trim().length === 0) return next(AppError.badRequest("Prompt cannot be empty"));
    if (prompt.length > MAX_PROMPT_LENGTH) return next(AppError.badRequest("Prompt is too long"));

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    try {
      const user = await this.userRepository.findById(sessionId);
      console.log(user);

      if (user.credits < CREDITS_PER_REQUEST) return next(AppError.forbidden("Not enough credits"));
      await this.userRepository.deductCredits(sessionId, CREDITS_PER_REQUEST);

      if (!sessionStates.has(sessionId)) {
        sessionStates.set(sessionId, {});
      }
      const sessionState = sessionStates.get(sessionId)!;

      if (sessionState.lastResponseCode === RESPONSE_CODES.NEED_MORE_INFO) {
        sessionState.lastResponseCode = undefined;
        const directMessage = await translateMessage(
          `Compris. Vous n'avez pas de préférence pour la taille.`,
          DEFAULT_LANGUAGE
        );
        await this.conversationMemory.addTurn(prompt, directMessage);
        await sendDirectResponse(directMessage, res);
        const creditsUpdateEvent = JSON.stringify({ type: "creditsUpdate", credits: user.credits });
        res.write(`data: ${creditsUpdateEvent}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }

      const history = await this.conversationMemory.getHistory();
      const conversationSoFar = history ? `${history}\nUser: ${prompt}` : prompt;

      const languageCode = await detectLanguage(prompt);
      console.log(`Query language detected: ${languageCode}`);

      const aiResponse = await searchSpacesWithAI(conversationSoFar, prompt, languageCode);

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
        await sendDirectResponse(aiResponse.message, res);
        const creditsUpdateEvent = JSON.stringify({ type: "creditsUpdate", credits: user.credits });
        res.write(`data: ${creditsUpdateEvent}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }
      const finalSystemPrompt = getSystemPrompt(BASE_SYSTEM_PROMPT, languageCode);
      await this.streamOpenAIResponse(finalSystemPrompt, prompt, aiResponse.message, res, user, next);
    } catch (error) {
      console.error("Error in handleChat:", error);
      if (!res.writableEnded) {
        res.write("data: [DONE]\n\n");
        res.end();
      }
      return next(AppError.internal("Error processing request"));
    }
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
      const response = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: CHAT_MODEL,
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
      const creditsUpdateEvent = JSON.stringify({ type: "creditsUpdate", credits: user.credits });
      res.write(`data: ${creditsUpdateEvent}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error) {
      console.error("Error in streamOpenAIResponse:", error);
      if (!res.writableEnded) {
        res.write("data: [DONE]\n\n");
        res.end();
      }
      next(AppError.internal("Error processing request"));
    }
  }
}

export default new ChatController();
