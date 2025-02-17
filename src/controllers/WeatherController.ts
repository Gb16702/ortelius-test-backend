import { Request, Response, NextFunction } from "express";
import { WeatherService } from '../services/weatherService';
import { AppError } from "../errors/AppError";

class WeatherController {
  private weatherService: WeatherService;

  constructor() {
    this.weatherService = new WeatherService();
  }

  public async getWeather(req: Request, res: Response, next: NextFunction) {
    const { city } = req.params;

    if (!city) {
      return next(AppError.badRequest("City parameter is required"));
    }

    try {
      const weatherData = await this.weatherService.getPortWeather(city);
      return res.json(weatherData);
    } catch (error) {
      console.error('WeatherController error:', error);
      return next(AppError.internal('Failed to fetch weather data'));
    }
  }
}

export default new WeatherController();