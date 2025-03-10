import { Space } from "@models/storageSchema";
import { CacheService } from "./CacheService";
import { MemoryStorage } from "node-ts-cache-storage-memory";
import { AI_CONFIG } from "@config/ai";

export class StorageService {
  private resultsCache: CacheService<any[]>;

  constructor() {
    this.resultsCache = new CacheService<any[]>(
      new MemoryStorage(),
      AI_CONFIG.RESULTS_CACHE_TTL
    );
  }

  public async findSpacesByLocation(location: string): Promise<any[]> {
    if (!location || location.trim().length === 0) {
      return [];
    }

    const normalizedLocation = location.trim().toLowerCase();
    const cacheKey = `storageSpaces_${normalizedLocation}`;

    const cachedResults = await this.resultsCache.get<any[]>(cacheKey);
    if (cachedResults) {
      return cachedResults;
    }

    try {
      const query = {
        "location.address": {
          $regex: normalizedLocation,
          $options: "i"
        }
      };

      const spaces = await Space.find(query)
        .limit(AI_CONFIG.QUERY_LIMIT)
        .lean();


      await this.resultsCache.set(cacheKey, spaces);
      return spaces;
    } catch (error) {
      console.error("Error finding storage spaces:", error);
      return [];
    }
  }

  public async findSpacesByQuery(query: any): Promise<any[]> {
    if (!query) {
      return [];
    }

    try {
      const spaces = await Space.find(query)
        .limit(AI_CONFIG.QUERY_LIMIT)
        .lean();

      return spaces;
    } catch (error) {
      console.error("Error executing MongoDB query:", error);
      return [];
    }
  }

  public formatStorageSpaces(spaces: any[]): string {
    if (spaces.length === 0) {
      return "";
    }

    let responseText = "**Here are available storage spaces:**\n\n";

    for (const space of spaces) {
      responseText += `- **${space.name || 'Storage Space'}**, **${space.space_in_square_m || 'N/A'}m²**, located at **${space.location?.address || 'N/A'}**\n`;

      if (space.services?.length) {
        responseText += `  - Services: ${space.services.join(", ")}\n`;
      }

      if (space.categories?.length) {
        responseText += `  - Suitable for: ${space.categories.join(", ")}\n`;
      }
    }

    return responseText;
  }
}

export default new StorageService();