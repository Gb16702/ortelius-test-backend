import { Router } from "express";

const chat = () => () => () => "";
const router = Router();

router.post("/", chat as any);