import { Router } from "express";
import WeatherController from "../controllers/WeatherController";

const router = Router();

router.get("/weather/:city", WeatherController.getWeather.bind(WeatherController) as any);

export default router;