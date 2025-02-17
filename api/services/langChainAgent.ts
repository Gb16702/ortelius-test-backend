import { ChatOpenAI } from "@langchain/openai";
import { Space } from "../models/storageSchema";
import { WeatherService } from "./weatherService";
import dotenv from "dotenv";

dotenv.config();

const weatherService = new WeatherService();

const llm = new ChatOpenAI({
  model: "gpt-4-turbo",
  temperature: 0.5,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

const detectWeatherIntent = async (userPrompt: string) => {
  console.log("🔍 Analyzing weather intent for:", userPrompt);

  const response = await llm.invoke([
    {
      role: "system",
      content: `
      You are a logistics and maritime AI assistant. Analyze the user's query and categorize it based on the following classification.

      **Output JSON format:**
      {
        "isWeatherQuery": boolean,       // True if related to maritime or port weather
        "city": string | null,           // Extract city name if relevant
        "queryCategory": string | null,  // One of: "warehouse", "freight_forwarding", "customs", "port_services", "cargo_management", "maritime_weather", "other"
        "filters": string[]               // Extract relevant filters (if any) based on query
      }

      **Categories:**
      - "warehouse": Queries related to **storage spaces, warehouses, availability**
      - "freight_forwarding": Questions about **shipping, transport logistics, Incoterms**
      - "customs": Related to **duties, import/export documentation, compliance**
      - "port_services": Includes **container handling, bunkering, cranes, repairs**
      - "cargo_management": Managing **cargo types, special handling requirements**
      - "maritime_weather": Weather affecting **shipping, navigation, ports**
      - "other": If the query does not fit into these categories

      **Filters Extraction:**
      Extract relevant filters from this list if present in the query:
      - Container Handling, Liquid Handling, Cranes, Firefighting, Sustainable Practices
      - Port Authority, Buoys, Radar Systems, High-speed Internet, Strict Environmental Policies
      - Transparent Tariffs and Fees, Restaurants, Recreational Areas, Accommodation
      - Road Connectivity, Rail Connectivity, Hydrogen Fueling, Emergency Response Teams
      - Ship Repair Services, Port Management System, Lighthouses, Chandlery Services
      - Waterway Connectivity, Container Docks, Tracking Systems, Multipurpose Docks
      - Bulk Handling, Fueling, Bunkering, Medical Facilities, Conveyor Belts, LNG Fueling
      - Customs Facilities, Wi-Fi Hotspots

      **Example Inputs & Outputs:**
      - "What's the weather like at Shanghai Port?"
        → { "isWeatherQuery": true, "city": "Shanghai", "queryCategory": "maritime_weather", "filters": [] }

      - "I need a 500m² warehouse in Hamburg with refrigeration"
        → { "isWeatherQuery": false, "city": "Hamburg", "queryCategory": "warehouse", "filters": ["Refrigerated Cargo (Reefer)"] }

      - "What are the customs fees for importing electronics to Rotterdam?"
        → { "isWeatherQuery": false, "city": "Rotterdam", "queryCategory": "customs", "filters": ["Electronics and High-Tech Goods"] }

      - "Where can I refuel with LNG in Singapore?"
        → { "isWeatherQuery": false, "city": "Singapore", "queryCategory": "port_services", "filters": ["LNG Fueling"] }

      Now, analyze this query:
      `,
    },
    { role: "user", content: userPrompt },
  ]);

  try {
    const parsedResponse = JSON.parse(response.content as string);
    console.log("📋 Weather intent analysis:", parsedResponse);
    return parsedResponse;
  } catch (error) {
    console.error("Error parsing weather intent:", error);
    return { isWeatherQuery: false, city: null, isPortRelated: false };
  }
};

const generateMongoQuery = async (userPrompt: string) => {
  const response = await llm.invoke([
    {
      role: "system",
      content: `
        You are an AI assistant specialized in **logistics and storage management**.
        Your task is to **convert natural language queries into MongoDB queries**.

        🔹 **IMPORTANT**: Return only a **valid JSON object**, with **no explanations**.
        🔹 **If the query is too vague**, add the field **"_needMoreInfo": true**.

        ## **Examples**:
        - **User**: "I need a 200m² warehouse in Lyon with CCTV."
          → \`{ "space_type": "warehouse", "space_in_square_m": { "$gte": 200 }, "location.address": { "$regex": "Lyon", "$options": "i" }, "services": { "$all": ["CCTV"] } }\`

        Now, generate a MongoDB query for the following user request:
      `,
    },
    { role: "user", content: userPrompt },
  ]);

  try {
    let query = JSON.parse(response.content as string);

    if (query.space_type && typeof query.space_type === "string") {
      query.space_type = { "$regex": "warehouse", "$options": "i" };
    }

    console.log("MongoDB Request generated:", query);
    return query;
  } catch (error) {
    console.error("Error parsing JSON:", error);
    return null;
  }
};


const detectIncotermQuery = async (userPrompt: string) => {
  console.log("🔍 Checking for Incoterm context:", userPrompt);

  const response = await llm.invoke([
    {
      role: "system",
      content: `
      Analyze whether the query is related to Incoterms.
      **Return ONLY a valid JSON** with this structure:
      {
        "isIncotermQuery": boolean,
        "needsMoreInfo": boolean,
        "suggestedIncoterm": string | null
      }

      Example analysis:
      - "What Incoterm should I use for shipping auto parts from China to Germany?"
        → { "isIncotermQuery": true, "needsMoreInfo": false, "suggestedIncoterm": "FOB" }
      - "I need help with Incoterms."
        → { "isIncotermQuery": true, "needsMoreInfo": true, "suggestedIncoterm": null }

      Analyze this request:
      `,
    },
    { role: "user", content: userPrompt },
  ]);

  try {
    const parsedResponse = JSON.parse(response.content as string);
    console.log("Incoterm analysis:", parsedResponse);
    return parsedResponse;
  } catch (error) {
    console.error("Error parsing Incoterm response:", error);
    return { isIncotermQuery: false, needsMoreInfo: false, suggestedIncoterm: null };
  }
};

const formatWeatherResponse = async (userPrompt: string, weatherData: any) => {
  const response = await llm.invoke([
    {
      role: "system",
      content: `
        You are a **maritime logistics expert** assessing weather conditions **for port operations**.
        Your task is to determine **if the weather is favorable or not** for maritime activities.

        🔹 **Rules for classification**:
        - If **wind speed < 20 km/h** and **no storms**, weather is **favorable**.
        - If **wind speed between 20-40 km/h** or **light rain**, weather is **moderate**.
        - If **wind speed > 40 km/h** or **storms**, weather is **unfavorable**.

        🔹 **Response format**:
        Return a single-line response indicating if the **weather is favorable, moderate, or unfavorable**.
        Example:
        - **Favorable**: "The weather is favorable for shipping operations."
        - **Moderate**: "Weather conditions are moderate. Proceed with caution."
        - **Unfavorable**: "The weather is unfavorable. High risks for maritime operations."

        Use only the provided weather data and do not invent information.
      `,
    },
    {
      role: "user",
      content: `
        Original question: "${userPrompt}"

        Current weather data:
        - Location: ${weatherData.location}
        - Wind speed: ${weatherData.windSpeed} km/h
        - Weather conditions: ${weatherData.description}

        Evaluate the weather based on the given rules and respond accordingly.
      `,
    },
  ]);

  return response.content as string;
};

const searchSpacesWithAI = async (userPrompt: string) => {
  const incotermIntent = await detectIncotermQuery(userPrompt);
  if (incotermIntent.isIncotermQuery) {
    if (incotermIntent.needsMoreInfo) {
      return "**Which aspect of Incoterms do you need help with?** (Cost breakdown, responsibility, customs?)";
    }
    return `**Based on your request, the best Incoterm is:** **${incotermIntent.suggestedIncoterm}**.
    Would you like details on why this is the best choice?`;
  }

  const weatherIntent = await detectWeatherIntent(userPrompt);
  if (weatherIntent.isWeatherQuery && weatherIntent.city) {
    console.log("✅ Weather query detected for city:", weatherIntent.city);
    try {
      const weatherData = await weatherService.getPortWeather(weatherIntent.city);
      const formattedResponse = await formatWeatherResponse(userPrompt, weatherData);
      return formattedResponse;
    } catch (error) {
      return "Unable to fetch weather details at the moment.";
    }
  }

  const query = await generateMongoQuery(userPrompt);
  if (!query) return "I didn't understand your request.";

  if (query._needMoreInfo) {
    return "**I need more details.** What size, location, or features are required?";
  }

  const results = await Space.find(query).limit(5);
  console.log(results);
  console.log(results.length);
  if (results.length === 0) {
    return "No matching storage spaces found.";
  }

  let responseText = "**Here are available storage spaces:**\n\n";
  results.forEach((space: any) => {
    responseText += `- **${space.name}**, **${space.space_in_square_m}m²**, located at **${space.location?.address}**\n`;
  });

  return responseText;
};

export { searchSpacesWithAI };
