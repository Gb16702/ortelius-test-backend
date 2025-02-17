interface WeatherResponse {
  temperature: number;
  humidity: number;
  windSpeed: number;
  description: string;
  location: string;
}

interface OpenWeatherResponse {
  main: {
    temp: number;
    humidity: number;
  };
  wind: {
    speed: number;
  };
  weather: Array<{
    description: string;
  }>;
  name: string;
}

export class WeatherService {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.openweathermap.org/data/2.5';

  constructor() {
    this.apiKey = process.env.OPENWEATHER_API_KEY as string;
  }

  async getPortWeather(city: string): Promise<WeatherResponse> {
    try {
      console.log(`Fetching weather for ${city}...`);

      const response = await fetch(
        `${this.baseUrl}/weather?q=${city}&units=metric&appid=${this.apiKey}`
      );

      if (!response.ok) {
        console.error(`Weather API error: ${response.statusText}`);
        throw new Error('Weather data fetch failed');
      }

      const data = await response.json() as OpenWeatherResponse;
      console.log(`Weather data received for ${city}`);

      return {
        temperature: Math.round(data.main.temp),
        humidity: data.main.humidity,
        windSpeed: Math.round(data.wind.speed * 3.6),
        description: data.weather[0].description,
        location: data.name
      };
    } catch (error) {
      console.error(`Weather service error:`, error);
      throw new Error(`Failed to get weather data: ${error}`);
    }
  }
}