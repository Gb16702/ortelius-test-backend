import { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/AppError";
import { searchSpacesWithAI } from "../services/langChainAgent";
import { WeatherService } from "../services/weatherService";

const URL = "https://api.openai.com/v1/chat/completions" as const;
const systemPrompt = `You are a maritime and logistics expert. Your responses must be **formatted in Markdown**.

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
- **Always respond in English**, regardless of the user's question language.
- **Structure your answers clearly using Markdown**.
- **Use bold formatting** for key terms.**
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
- **Always format the first sentence of your response with bold key terms.**
- **Use lists and bullet points** for better clarity.**
- **If you conclude, insert a blank line before it and use bold formatting.**
`;

class ChatController {
  private weatherService = new WeatherService();
  constructor() {
    this.weatherService = new WeatherService();
  }

  public async handleChat(req: Request, res: Response, next: NextFunction) {
    const { prompt, sessionId } = req.body;
    if (!prompt || prompt.trim().length === 0) {
      return next(AppError.badRequest("Prompt cannot be empty"));
    }

    try {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const aiResponse = await searchSpacesWithAI(prompt);

      let contextualPrompt = systemPrompt;
      let assistantContext = aiResponse;

      if (aiResponse.includes("météorologiques") || aiResponse.includes("weather")) {
        contextualPrompt += `\n\nContexte météorologique actuel:\n${aiResponse}`;
        assistantContext = "Utilise le contexte météorologique fourni pour enrichir ta réponse.";
      }

      const response = await fetch(URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4",
          messages: [
            { role: "system", content: contextualPrompt },
            { role: "user", content: prompt },
            { role: "assistant", content: assistantContext },
          ],
          temperature: 0.2,
          stream: true,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`OpenAI API Error: ${response.statusText}`);
      }

      const reader = response?.body?.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          if (!reader) throw new Error("No reader available");
          const result = await reader.read();
          if (!result || result.done) break;

          if (!result.value) continue;

          const chunk = decoder.decode(result?.value, {
            stream: true,
          });

          chunk.split("\n").forEach(line => {
            if (line.startsWith("data:")) {
              const json = line.replace("data:", "").trim();
              if (json === "[DONE]") {
                res.write("data: [DONE]\n\n");
                return;
              }

              try {
                const parsed = JSON.parse(json);
                res.write(`data: ${json}\n\n`);
              } catch (error) {
                console.error("Error parsing JSON:", error);
              }
            }
          });
        }

        if (!res.writableEnded) {
          res.write("\n\n");
          res.end();
        }
      } catch (error) {
        console.error("Error in handleChat : ", error);
        if (!res.writableEnded) {
          res.write("data: [DONE]\n\n");
          res.end();
        }

        return next(AppError.internal("Error processing request"));
      }
    } catch (e) {
      console.error("Error in handleChat:", e);
      return next(AppError.internal("Error processing request"));
    }
  }
}

export default new ChatController();
