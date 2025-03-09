import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `
            Vous êtes un expert en logistique et commerce international spécialisé dans les Incoterms.
            Analysez si la requête est liée aux Incoterms et fournissez des insights détaillés.

            **Retournez UNIQUEMENT un JSON valide** avec cette structure:
            {
              "isIncotermQuery": boolean,
              "needsMoreInfo": boolean,
              "suggestedIncoterm": string | null,
              "costBreakdown": {
                "seller": string[],
                "buyer": string[]
              },
              "responsibilities": {
                "seller": string[],
                "buyer": string[]
              }
            }

            Pour le "suggestedIncoterm", considérez:
            - EXW: Quand l'acheteur gère toute la logistique
            - FCA: Pour les petites expéditions quand le vendeur livre au transporteur
            - FOB: Pour le fret maritime quand le vendeur charge les marchandises sur le navire
            - CIF: Quand le vendeur paie le fret et l'assurance jusqu'au port de destination
            - DDP: Quand le vendeur gère tous les coûts jusqu'à la destination finale
            `;

export interface IncotermsAnalysis {
  isIncotermQuery: boolean;
  needsMoreInfo: boolean;
  suggestedIncoterm: string | null;
  costBreakdown?: {
    seller: string[];
    buyer: string[];
  };
  responsabilities?: {
    seller: string[];
    buyer: string[];
  };
}

export class IncotermsService {
  public async analyzeIncotermQuery(userPrompt: string): Promise<IncotermsAnalysis> {
    console.log("Analyze incoterms context: ", userPrompt);

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        temperature: 0.2,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No content found in response");
      }

      const parsedResponse = JSON.parse(content);
      console.log("Incoterm analysis: ", parsedResponse);

      return parsedResponse as IncotermsAnalysis;
    } catch (error) {
      console.error("Error parsing incoterm response: ", error);
      return {
        isIncotermQuery: false,
        needsMoreInfo: false,
        suggestedIncoterm: null,
      };
    }
  }
}
