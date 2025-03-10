// import { ChatOpenAI } from "@langchain/openai";
// import { Space } from "../models/storageSchema";
// import { WeatherService } from "./weatherService";
// import { Cache, CacheContainer } from "node-ts-cache";
// import { MemoryStorage } from "node-ts-cache-storage-memory";
// import dotenv from "dotenv";

// dotenv.config();

// interface AIResponse {
//   code: string;
//   message: string;
// }

// const OPENAI_MODEL = "gpt-4-turbo";
// const DEFAULT_TEMPERATURE = 0.5;
// const QUERY_LIMIT = 3;
// const WEATHER_CACHE_TTL = 1800;
// const RESULTS_CACHE_TTL = 3600;
// const INTENT_CACHE_TTL = 1800;
// const MONGO_QUERY_CACHE_TTL = 3600;
// const DEFAULT_LANGUAGE = "en";

// const LOGISTICS_REGEX =
//   /\b(ship|shipping|freight|cargo|transport|logistics|incoterm|export|import|customs|duties|fob|cif|exw|dap|ddp|cfr|fas|delivery terms)\b/i;
// const WEATHER_REGEX = /\b(weather|forecast|conditions|storm|wind|precipitation|rain|snow|temperature|climate|meteo)\b/i;

// const weatherCache = new CacheContainer(new MemoryStorage());
// const resultsCache = new CacheContainer(new MemoryStorage());
// const intentCache = new CacheContainer(new MemoryStorage());
// const mongoQueryCache = new CacheContainer(new MemoryStorage());

// const weatherService = new WeatherService();

// const createLLM = (temperature = DEFAULT_TEMPERATURE) =>
//   new ChatOpenAI({
//     model: OPENAI_MODEL,
//     temperature,
//     openAIApiKey: process.env.OPENAI_API_KEY,
//     maxConcurrency: 5,
//     maxRetries: 3,
//   });

// const llmForIntent = createLLM(0.2);
// const llmForQueries = createLLM(0.5);
// const llmForFormatting = createLLM(0.3);

// const findRelevantStorageSpaces = async (location: string) => {
//   if (!location || location.trim().length === 0) {
//     console.error("Empty location provided to findRelevantStorageSpaces");
//     return [];
//   }

//   const normalizedLocation = location.trim().toLowerCase();

//   const cacheKey = `storageSpaces_${normalizedLocation}`;

//   const cachedResults = await resultsCache.getItem<any[]>(cacheKey);
//   if (cachedResults) {
//     console.log(`🔄 Using cached storage spaces results for "${normalizedLocation}"`);
//     return cachedResults;
//   }

//   try {
//     console.log(`🔍 Searching for storage spaces with location "${normalizedLocation}"`);

//     const addressQuery = {
//       "location.address": { $regex: normalizedLocation, $options: "i" },
//     };

//     const cityQuery = {
//       "network_tags.city": { $regex: normalizedLocation, $options: "i" },
//     };

//     const countryQuery = {
//       "network_tags.country": { $regex: normalizedLocation, $options: "i" },
//     };

//     const [addressResults, cityResults, countryResults] = await Promise.all([
//       Space.find(addressQuery).limit(QUERY_LIMIT).lean(),
//       Space.find(cityQuery).limit(QUERY_LIMIT).lean(),
//       Space.find(countryQuery).limit(QUERY_LIMIT).lean(),
//     ]);

//     console.log(`📊 Search results: address=${addressResults.length}, city=${cityResults.length}, country=${countryResults.length}`);

//     const allSpaceIds = new Set();
//     const combinedSpaces = [] as any;

//     const addUniqueSpaces = (spaces: any) => {
//       for (const space of spaces) {
//         if (!allSpaceIds.has(space._id.toString())) {
//           allSpaceIds.add(space._id.toString());
//           combinedSpaces.push(space);
//         }
//       }
//     };

//     addUniqueSpaces(addressResults);
//     addUniqueSpaces(cityResults);

//     if (combinedSpaces.length < QUERY_LIMIT) {
//       addUniqueSpaces(countryResults);
//     }

//     const spaces = combinedSpaces.slice(0, QUERY_LIMIT);

//     console.log(`🏙️ Final storage spaces found: ${spaces.length}`);

//     await resultsCache.setItem(cacheKey, spaces, { ttl: RESULTS_CACHE_TTL });

//     return spaces;
//   } catch (error) {
//     console.error(`Error finding storage spaces for "${normalizedLocation}":`, error);
//     return [];
//   }
// };

// const extractLocations = async (userPrompt: string) => {
//   const cacheKey = `locations_${hashString(userPrompt)}`;

//   const cachedLocations = await intentCache.getItem<any>(cacheKey);
//   if (cachedLocations) {
//     return cachedLocations;
//   }

//   try {
//     const locationExtraction = await llmForIntent.invoke([
//       {
//         role: "system",
//         content: `
//         Extract origin and destination locations from the shipping query.
//         Return ONLY a JSON object with this structure:
//         {
//           "origin": string | null,
//           "destination": string | null
//         }

//         Example:
//         Query: "I need to ship auto parts from Shanghai to Hamburg"
//         Response: {"origin": "Shanghai", "destination": "Hamburg"}

//         If a location isn't specified, return null for that field.
//         `,
//       },
//       { role: "user", content: userPrompt },
//     ]);

//     let locations = { origin: null, destination: null };
//     try {
//       locations = JSON.parse(locationExtraction.content as string);

//       await intentCache.setItem(cacheKey, locations, { ttl: INTENT_CACHE_TTL });

//       return locations;
//     } catch (error) {
//       console.error("Error parsing locations:", error);
//       return locations;
//     }
//   } catch (error) {
//     console.error("Error extracting locations:", error);
//     return { origin: null, destination: null };
//   }
// };

// const analyzeMaritimeQuery = async (userPrompt: string, languageCode: string = DEFAULT_LANGUAGE) => {
//   console.log(`🔍 Analyzing maritime logistics query:`, userPrompt);

//   const locations = await extractLocations(userPrompt);
//   console.log("📍 Extracted locations:", locations);

//   let foundSpaces = false;
//   let destinationName = locations.destination;

//   let destinationSpaces = [];
//   if (locations.destination) {
//     console.log(`🔎 Searching for storage spaces in: ${locations.destination}`);
//     destinationSpaces = await findRelevantStorageSpaces(locations.destination);
//     console.log(`📦 Found ${destinationSpaces.length} storage spaces`);

//     if (destinationSpaces.length === 0) {
//       console.log(`⚠️ No storage spaces found for destination: ${locations.destination}`);
//       const genericDestination = locations.destination.split(/[\s,]+/)[0];

//       if (genericDestination && genericDestination !== locations.destination) {
//         console.log(`🔄 Trying generic search with: ${genericDestination}`);
//         destinationSpaces = await findRelevantStorageSpaces(genericDestination);

//         if (destinationSpaces.length > 0) {
//           foundSpaces = true;
//           console.log(`📦 Found ${destinationSpaces.length} storage spaces with generic search`);
//         } else {
//           console.log("❌ No storage spaces found even with generic search");
//         }
//       }
//     } else {
//       foundSpaces = true;
//     }
//   }

//   let storageInfo = "";

//   if (foundSpaces && destinationSpaces.length > 0) {
//     storageInfo = "## Available Storage Facilities\n\n";
//     destinationSpaces.forEach((space: any) => {
//       storageInfo += `- **${space.name}** (${space.space_in_square_m}m²) - ${space.location?.address || space.network_tags?.city}\n`;
//       if (space.services && space.services.length > 0) {
//         storageInfo += `  - Services: ${space.services.join(", ")}\n`;
//       }
//       if (space.categories && space.categories.length > 0) {
//         storageInfo += `  - Suitable for: ${space.categories.join(", ")}\n`;
//       }
//     });
//   }

//   if (!foundSpaces && locations.destination) {
//     let noSpacesMessage = "";

//     if (languageCode === "fr") {
//       noSpacesMessage = `**Aucun espace de stockage trouvé à ${
//         locations.destination
//       } dans notre base de données.**\n\nVoici néanmoins les options d'expédition de ${locations.origin || "l'origine"} à ${
//         locations.destination
//       }:\n\n`;
//     } else if (languageCode === "es") {
//       noSpacesMessage = `**No se encontraron espacios de almacenamiento en ${
//         locations.destination
//       } en nuestra base de datos.**\n\nSin embargo, aquí están las opciones de envío de ${locations.origin || "origen"} a ${
//         locations.destination
//       }:\n\n`;
//     } else if (languageCode === "de") {
//       noSpacesMessage = `**Keine Lagerräume in ${
//         locations.destination
//       } in unserer Datenbank gefunden.**\n\nHier sind dennoch die Versandoptionen von ${locations.origin || "Ursprung"} nach ${
//         locations.destination
//       }:\n\n`;
//     } else {
//       noSpacesMessage = `**No storage spaces found in ${locations.destination} in our database.**\n\nHowever, here are the shipping options from ${
//         locations.origin || "origin"
//       } to ${locations.destination}:\n\n`;
//     }

//     const maritimePrompt = `
//       You are a specialized maritime logistics expert focusing exclusively on sea freight solutions.

//       IMPORTANT:
//       1. You MUST respond in ${languageCode} language only.
//       2. Do NOT start your response by mentioning storage spaces or lack thereof.
//       3. ONLY provide shipping advice - container options, transit times, and Incoterms recommendations.
//       4. Keep your answer focused on maritime/sea freight options.
//       5. Structure your response with bullet points for container options and Incoterms.
//       6. Use bold text for key maritime terms.
//       7. Keep your response under 200 words, focusing only on relevant information.

//       Query: ${userPrompt}
//     `;

//     const shippingInfo = await llmForQueries.invoke([
//       { role: "system", content: maritimePrompt },
//       { role: "user", content: userPrompt },
//     ]);

//     return noSpacesMessage + (shippingInfo.content as string);
//   }

//   const response = await llmForQueries.invoke([
//     {
//       role: "system",
//       content: `
//       You are a specialized maritime logistics expert focusing exclusively on sea freight solutions. Your responses should be concise, practical, and focused on maritime shipping.

//       IMPORTANT: You MUST respond in ${languageCode} language only.

//       When answering shipping queries:
//       1. Focus ONLY on maritime/sea freight options
//       2. Provide brief, practical information about maritime routes
//       3. Recommend appropriate maritime Incoterms (FOB, CFR, CIF, FAS)
//       4. Keep responses concise and business-oriented

//       Your response should follow this structure:
//       1. A brief introduction (1-2 sentences maximum)
//       2. Practical container options for the specific cargo
//       3. Estimated transit time for the sea route
//       4. Incoterm recommendations with brief explanation of responsibilities

//       If storage facilities information is provided, incorporate it naturally in your response when recommending options at the destination port.

//       Format your response in professional, concise Markdown with:
//       - Clear, brief sections
//       - Bullet points for container options and Incoterms
//       - Bold text for key maritime terms

//       Avoid lengthy explanations about port capabilities unless specifically asked.
//       Keep your entire response under 250 words, focusing on the most relevant information.

//       Analyze this maritime shipping query:
//       `,
//     },
//     {
//       role: "user",
//       content: `
//       Query: ${userPrompt}

//       ${storageInfo ? "Storage information at destination:" + storageInfo : ""}
//       `,
//     },
//   ]);

//   return response.content as string;
// };

// const detectLogisticsIntent = async (userPrompt: string) => {
//   const cacheKey = `logisticsIntent_${hashString(userPrompt)}`;

//   const cachedIntent = await intentCache.getItem<any>(cacheKey);
//   if (cachedIntent) {
//     return cachedIntent;
//   }

//   const isLogisticsQuery = LOGISTICS_REGEX.test(userPrompt);

//   const result = {
//     isLogisticsQuery,
//     needsFullAnalysis: isLogisticsQuery,
//   };

//   await intentCache.setItem(cacheKey, result, { ttl: INTENT_CACHE_TTL });

//   return result;
// };

// const detectWeatherIntent = async (userPrompt: string) => {
//   const cacheKey = `weatherIntent_${hashString(userPrompt)}`;

//   const cachedIntent = await intentCache.getItem<any>(cacheKey);
//   if (cachedIntent) {
//     return cachedIntent;
//   }

//   if (!WEATHER_REGEX.test(userPrompt)) {
//     const result = { isWeatherQuery: false, city: null, queryCategory: "other", filters: [] };
//     await intentCache.setItem(cacheKey, result, { ttl: INTENT_CACHE_TTL });
//     return result;
//   }

//   console.log("🔍 Analyzing weather intent for:", userPrompt);

//   try {
//     const response = await llmForIntent.invoke([
//       {
//         role: "system",
//         content: `
//         You are a logistics and maritime AI assistant. Analyze the user's query and categorize it based on the following classification.

//         **Output JSON format:**
//         {
//           "isWeatherQuery": boolean,       // True if related to maritime or port weather
//           "city": string | null,           // Extract city name if relevant
//           "queryCategory": string | null,  // One of: "warehouse", "freight_forwarding", "customs", "port_services", "cargo_management", "maritime_weather", "other"
//           "filters": string[]               // Extract relevant filters (if any) based on query
//         }

//         **Categories:**
//         - "warehouse": Queries related to **storage spaces, warehouses, availability**
//         - "freight_forwarding": Questions about **shipping, transport logistics, Incoterms**
//         - "customs": Related to **duties, import/export documentation, compliance**
//         - "port_services": Includes **container handling, bunkering, cranes, repairs**
//         - "cargo_management": Managing **cargo types, special handling requirements**
//         - "maritime_weather": Weather affecting **shipping, navigation, ports**
//         - "other": If the query does not fit into these categories

//         Now, analyze this query:
//         `,
//       },
//       { role: "user", content: userPrompt },
//     ]);

//     try {
//       const parsedResponse = JSON.parse(response.content as string);
//       console.log("📋 Weather intent analysis:", parsedResponse);

//       await intentCache.setItem(cacheKey, parsedResponse, { ttl: INTENT_CACHE_TTL });

//       return parsedResponse;
//     } catch (error) {
//       console.error("Error parsing weather intent:", error);
//       return { isWeatherQuery: false, city: null, queryCategory: "other", filters: [] };
//     }
//   } catch (error) {
//     console.error("Error in weather intent detection:", error);
//     return { isWeatherQuery: false, city: null, queryCategory: "other", filters: [] };
//   }
// };

// const generateMongoQuery = async (userPrompt: string) => {
//   const cacheKey = `mongoQuery_${hashString(userPrompt)}`;

//   const cachedQuery = await mongoQueryCache.getItem<any>(cacheKey);
//   if (cachedQuery) {
//     return cachedQuery;
//   }

//   try {
//     const response = await llmForQueries.invoke([
//       {
//         role: "system",
//         content: `
//           You are an AI assistant specialized in **logistics and storage management**.
//           Your task is to **convert natural language queries into MongoDB queries**.

//           🔹 **IMPORTANT**: Return only a **valid JSON object**, with **no explanations**.
//           🔹 **If the query is too vague**, add the field **"_needMoreInfo": true**.

//           ## **Examples**:
//           - **User**: "I need a 200m² warehouse in Lyon with CCTV."
//             → \`{ "space_type": "warehouse", "space_in_square_m": { "$gte": 200 }, "location.address": { "$regex": "Lyon", "$options": "i" }, "services": { "$in": ["cctv-surveillance"] } }\`

//           Now, generate a MongoDB query for the following user request:
//         `,
//       },
//       { role: "user", content: userPrompt },
//     ]);

//     try {
//       let query = JSON.parse(response.content as string);

//       if (query.space_type && typeof query.space_type === "string") {
//         query.space_type = { $regex: query.space_type, $options: "i" };
//       }

//       console.log("MongoDB Request generated:", query);

//       await mongoQueryCache.setItem(cacheKey, query, { ttl: MONGO_QUERY_CACHE_TTL });

//       return query;
//     } catch (error) {
//       console.error("Error parsing JSON:", error);
//       return null;
//     }
//   } catch (error) {
//     console.error("Error generating MongoDB query:", error);
//     return null;
//   }
// };

// const formatWeatherResponse = async (userPrompt: string, weatherData: any, languageCode: string = DEFAULT_LANGUAGE) => {
//   const cacheKey = `weatherResponse_${hashString(userPrompt)}_${hashString(JSON.stringify(weatherData))}_${languageCode}`;

//   const cachedResponse = await weatherCache.getItem<string>(cacheKey);
//   if (cachedResponse) {
//     return cachedResponse;
//   }

//   try {
//     if (weatherData.windSpeed < 20 && !weatherData.description.toLowerCase().includes("storm")) {
//       const weatherPrompt = `
//       You are a maritime weather expert. Provide a brief assessment.

//       IMPORTANT: You MUST respond in ${languageCode} language only.

//       Please state that the weather is favorable for shipping operations.
//       Keep your response to a single sentence.
//       `;

//       const response = await llmForFormatting.invoke([
//         { role: "system", content: weatherPrompt },
//         { role: "user", content: "Generate a favorable weather response" },
//       ]);

//       await weatherCache.setItem(cacheKey, response.content as string, { ttl: WEATHER_CACHE_TTL });
//       return response.content as string;
//     }

//     if (weatherData.windSpeed > 40 || weatherData.description.toLowerCase().includes("storm")) {
//       const weatherPrompt = `
//       You are a maritime weather expert. Provide a brief assessment.

//       IMPORTANT: You MUST respond in ${languageCode} language only.

//       Please state that the weather is unfavorable with high risks for maritime operations.
//       Keep your response to a single sentence.
//       `;

//       const response = await llmForFormatting.invoke([
//         { role: "system", content: weatherPrompt },
//         { role: "user", content: "Generate an unfavorable weather response" },
//       ]);

//       await weatherCache.setItem(cacheKey, response.content as string, { ttl: WEATHER_CACHE_TTL });
//       return response.content as string;
//     }

//     const response = await llmForFormatting.invoke([
//       {
//         role: "system",
//         content: `
//           You are a **maritime logistics expert** assessing weather conditions **for port operations**.

//           IMPORTANT: You MUST respond in ${languageCode} language only.

//           🔹 **Rules for classification**:
//           - If **wind speed < 20 km/h** and **no storms**, weather is **favorable**.
//           - If **wind speed between 20-40 km/h** or **light rain**, weather is **moderate**.
//           - If **wind speed > 40 km/h** or **storms**, weather is **unfavorable**.

//           🔹 **Response format**:
//           Return a single-line response indicating if the **weather is favorable, moderate, or unfavorable**.
//           Example:
//           - **Favorable**: "The weather is favorable for shipping operations."
//           - **Moderate**: "Weather conditions are moderate. Proceed with caution."
//           - **Unfavorable**: "The weather is unfavorable. High risks for maritime operations."

//           Use only the provided weather data and do not invent information.
//         `,
//       },
//       {
//         role: "user",
//         content: `
//           Original question: "${userPrompt}"

//           Current weather data:
//           - Location: ${weatherData.location}
//           - Wind speed: ${weatherData.windSpeed} km/h
//           - Weather conditions: ${weatherData.description}

//           Evaluate the weather based on the given rules and respond accordingly.
//         `,
//       },
//     ]);

//     const formattedResponse = response.content as string;

//     await weatherCache.setItem(cacheKey, formattedResponse, { ttl: WEATHER_CACHE_TTL });

//     return formattedResponse;
//   } catch (error) {
//     console.error("Error formatting weather response:", error);

//     const errorPrompt = `
//     You are a maritime weather expert. There was an error processing weather data.

//     IMPORTANT: You MUST respond in ${languageCode} language only.

//     Please state that you were unable to format weather details at the moment.
//     Keep your response brief and professional.
//     `;

//     try {
//       const errorResponse = await llmForFormatting.invoke([
//         { role: "system", content: errorPrompt },
//         { role: "user", content: "Generate a weather error message" },
//       ]);

//       return errorResponse.content as string;
//     } catch (secondaryError) {
//       return languageCode === "fr"
//         ? "Impossible de formater les détails météorologiques pour le moment."
//         : languageCode === "es"
//         ? "No se pueden formatear los detalles del clima en este momento."
//         : languageCode === "de"
//         ? "Wetterdetails können momentan nicht formatiert werden."
//         : "Unable to format weather details at the moment.";
//     }
//   }
// };

// const searchSpacesWithAI = async (userPrompt: string, languageCode: string = DEFAULT_LANGUAGE) => {
//   console.log(`📝 Processing user query in ${languageCode}:`, userPrompt);

//   const startTime = Date.now();

//   try {
//     const [logisticsIntent, weatherIntent] = await Promise.all([detectLogisticsIntent(userPrompt), detectWeatherIntent(userPrompt)]);

//     console.log("🧠 Query classification:", {
//       isLogistics: logisticsIntent.isLogisticsQuery,
//       isWeather: weatherIntent.isWeatherQuery,
//       weatherCity: weatherIntent.city || "none",
//     });

//     if (logisticsIntent.isLogisticsQuery) {
//       console.log("✅ Maritime logistics query detected");
//       const response = await analyzeMaritimeQuery(userPrompt, languageCode);
//       console.log(`⏱️ Query processing completed in ${Date.now() - startTime}ms`);
//       return response;
//     }

//     if (weatherIntent.isWeatherQuery && weatherIntent.city) {
//       console.log("✅ Weather query detected for city:", weatherIntent.city);
//       try {
//         const weatherData = await weatherService.getPortWeather(weatherIntent.city);
//         const formattedResponse = await formatWeatherResponse(userPrompt, weatherData, languageCode);
//         console.log(`⏱️ Query processing completed in ${Date.now() - startTime}ms`);
//         return formattedResponse;
//       } catch (error) {
//         console.error("❌ Weather service error:", error);
//         console.log(`⏱️ Query processing completed with error in ${Date.now() - startTime}ms`);

//         const weatherErrorPrompt = `
//         You are a maritime weather expert. There was an error getting weather data for ${weatherIntent.city}.

//         IMPORTANT: You MUST respond in ${languageCode} language only.

//         Inform the user that you couldn't retrieve weather data for ${weatherIntent.city}.
//         Suggest they try again later or check another weather service.
//         Be professional and brief.
//         `;

//         try {
//           const errorResponse = await llmForFormatting.invoke([
//             { role: "system", content: weatherErrorPrompt },
//             { role: "user", content: "Generate a weather service error message" },
//           ]);

//           return errorResponse.content as string;
//         } catch (secondaryError) {
//           return languageCode === "fr"
//             ? `Impossible de récupérer les données météo pour ${weatherIntent.city}.`
//             : languageCode === "es"
//             ? `No se pueden obtener los datos meteorológicos para ${weatherIntent.city}.`
//             : languageCode === "de"
//             ? `Wetterdaten für ${weatherIntent.city} können nicht abgerufen werden.`
//             : `Unable to fetch weather data for ${weatherIntent.city}.`;
//         }
//       }
//     }

//     let potentialLocation = null;
//     try {
//       const locations = await extractLocations(userPrompt);
//       potentialLocation = locations.destination || locations.origin;

//       if (potentialLocation) {
//         console.log(`🔍 Direct location extracted from query: ${potentialLocation}`);
//         const directSpaces = await findRelevantStorageSpaces(potentialLocation);

//         if (directSpaces.length > 0) {
//           console.log(`📦 Found ${directSpaces.length} spaces directly from extracted location`);
//           let responseText = "**Here are available storage spaces:**\n\n";
//           directSpaces.forEach((space: any) => {
//             responseText += `- **${space.name}**, **${space.space_in_square_m}m²**, located at **${
//               space.location?.address || space.network_tags?.city
//             }**\n`;
//             if (space.services && space.services.length > 0) {
//               responseText += `  - Services: ${space.services.join(", ")}\n`;
//             }
//             if (space.categories && space.categories.length > 0) {
//               responseText += `  - Suitable for: ${space.categories.join(", ")}\n`;
//             }
//           });

//           console.log(`⏱️ Query processing completed in ${Date.now() - startTime}ms`);
//           return responseText;
//         } else {
//           console.log(`❌ No spaces found for location: ${potentialLocation}`);

//           let noSpacesMessage = "";

//           if (languageCode === "fr") {
//             noSpacesMessage = `**Aucun espace de stockage trouvé à ${potentialLocation} dans notre base de données.**`;
//           } else if (languageCode === "es") {
//             noSpacesMessage = `**No se encontraron espacios de almacenamiento en ${potentialLocation} en nuestra base de datos.**`;
//           } else if (languageCode === "de") {
//             noSpacesMessage = `**Keine Lagerräume in ${potentialLocation} in unserer Datenbank gefunden.**`;
//           } else {
//             noSpacesMessage = `**No storage spaces found in ${potentialLocation} in our database.**`;
//           }

//           console.log(`⏱️ Query processing completed in ${Date.now() - startTime}ms`);
//           return noSpacesMessage;
//         }
//       }
//     } catch (error) {
//       console.error("Error extracting location directly:", error);
//     }

//     console.log("🔍 Generating MongoDB query for storage space search");
//     const query = await generateMongoQuery(userPrompt);
//     if (!query) {
//       console.log("❌ Failed to generate MongoDB query");
//       console.log(`⏱️ Query processing completed in ${Date.now() - startTime}ms`);

//       const errorPrompt = `
//       You are a logistics assistant. You couldn't understand the user's request.

//       IMPORTANT: You MUST respond in ${languageCode} language only.

//       Tell the user you didn't understand their request and ask them to provide more details.
//       Be polite and professional.
//       `;

//       try {
//         const errorResponse = await llmForFormatting.invoke([
//           { role: "system", content: errorPrompt },
//           { role: "user", content: userPrompt },
//         ]);

//         return errorResponse.content as string;
//       } catch (promptError) {
//         return languageCode === "fr"
//           ? "Je n'ai pas compris votre demande. Pourriez-vous fournir plus de détails ?"
//           : languageCode === "es"
//           ? "No entendí su solicitud. ¿Podría proporcionar más detalles?"
//           : languageCode === "de"
//           ? "Ich habe Ihre Anfrage nicht verstanden. Könnten Sie mehr Details angeben?"
//           : "I didn't understand your request. Could you provide more details?";
//       }
//     }

//     if (query._needMoreInfo) {
//       console.log("⚠️ Need more information for query");
//       console.log(`⏱️ Query processing completed in ${Date.now() - startTime}ms`);

//       const moreInfoPrompt = `
//       You are a logistics assistant. You need more information from the user.

//       IMPORTANT: You MUST respond in ${languageCode} language only.

//       Ask the user to provide more details about what size, location, or features they require.
//       Be polite and professional.
//       `;

//       try {
//         const moreInfoResponse = await llmForFormatting.invoke([
//           { role: "system", content: moreInfoPrompt },
//           { role: "user", content: userPrompt },
//         ]);

//         return moreInfoResponse.content as string;
//       } catch (promptError) {
//         return languageCode === "fr"
//           ? "**J'ai besoin de plus de détails.** Quelle taille, emplacement ou caractéristiques recherchez-vous ?"
//           : languageCode === "es"
//           ? "**Necesito más detalles.** ¿Qué tamaño, ubicación o características está buscando?"
//           : languageCode === "de"
//           ? "**Ich benötige weitere Details.** Welche Größe, welchen Standort oder welche Eigenschaften suchen Sie?"
//           : "**I need more details.** What size, location, or features are you looking for?";
//       }
//     }

//     console.log("🔍 Executing MongoDB query:", JSON.stringify(query));
//     const results = await Space.find(query).limit(5).lean();

//     console.log(`📊 MongoDB query returned ${results.length} results`);

//     if (results.length === 0) {
//       if (potentialLocation) {
//         const simpleLocation = potentialLocation.split(/[\s,]+/)[0];
//         console.log(`🔄 Last attempt with simplified location: ${simpleLocation}`);
//         const simpleResults = await findRelevantStorageSpaces(simpleLocation);

//         if (simpleResults.length > 0) {
//           console.log(`📦 Found ${simpleResults.length} spaces with simplified location`);
//           let responseText = "**Here are available storage spaces that might match your needs:**\n\n";
//           simpleResults.forEach((space: any) => {
//             responseText += `- **${space.name}**, **${space.space_in_square_m}m²**, located at **${space.location?.address || space.network_tags?.city}**\n`;
//             if (space.services && space.services.length > 0) {
//               responseText += `  - Services: ${space.services.join(", ")}\n`;
//             }
//             if (space.categories && space.categories.length > 0) {
//               responseText += `  - Suitable for: ${space.categories.join(", ")}\n`;
//             }
//           });

//           console.log(`⏱️ Query processing completed in ${Date.now() - startTime}ms`);
//           return responseText;
//         }
//       }

//       console.log("❌ No matching storage spaces found");
//       console.log(`⏱️ Query processing completed in ${Date.now() - startTime}ms`);

//       if (languageCode === "fr") {
//         return "**Aucun espace de stockage correspondant trouvé dans notre base de données.**";
//       } else if (languageCode === "es") {
//         return "**No se encontraron espacios de almacenamiento coincidentes en nuestra base de datos.**";
//       } else if (languageCode === "de") {
//         return "**Keine passenden Lagerräume in unserer Datenbank gefunden.**";
//       } else {
//         return "**No matching storage spaces found in our database.**";
//       }
//     }

//     let responseText = "**Here are available storage spaces:**\n\n";
//     results.forEach(space => {
//       responseText += `- **${space.name}**, **${space.space_in_square_m}m²**, located at **${
//         space.location?.address || space.network_tags?.city
//       }**\n`;
//       if (space.services && space.services.length > 0) {
//         responseText += `  - Services: ${space.services.join(", ")}\n`;
//       }
//       if (space.categories && space.categories.length > 0) {
//         responseText += `  - Suitable for: ${space.categories.join(", ")}\n`;
//       }
//     });

//     console.log(`⏱️ Query processing completed in ${Date.now() - startTime}ms`);
//     return responseText;
//   } catch (error) {
//     console.error("❌ Unhandled error in searchSpacesWithAI:", error);
//     console.log(`⏱️ Query processing failed in ${Date.now() - startTime}ms`);

//     const errorPrompt = `
//     You are a logistics assistant. An error occurred processing the user's request.

//     IMPORTANT: You MUST respond in ${languageCode} language only.

//     Apologize for the error and ask the user to try again.
//     Keep your response brief and professional.
//     `;

//     try {
//       const errorResponse = await llmForFormatting.invoke([
//         { role: "system", content: errorPrompt },
//         { role: "user", content: "Generate an error message" },
//       ]);

//       return errorResponse.content as string;
//     } catch (secondaryError) {
//       return languageCode === "fr"
//         ? "Je suis désolé, une erreur s'est produite lors du traitement de votre demande. Veuillez réessayer."
//         : languageCode === "es"
//         ? "Lo siento, se produjo un error al procesar su solicitud. Por favor, inténtelo de nuevo."
//         : languageCode === "de"
//         ? "Es tut mir leid, bei der Verarbeitung Ihrer Anfrage ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut."
//         : "I'm sorry, an error occurred while processing your request. Please try again.";
//     }
//   }
// };

// function hashString(str: string): string {
//   let hash = 0;
//   for (let i = 0; i < str.length; i++) {
//     const char = str.charCodeAt(i);
//     hash = (hash << 5) - hash + char;
//     hash |= 0;
//   }
//   return hash.toString(16);
// }

// export { searchSpacesWithAI };
