import UserController from "@controllers/UserController";
import { authenticateUser } from "@middleware/authMiddleware";
import { RequestHandler, Router } from "express";

const router = Router();

router.post("/login", UserController.login.bind(UserController) as RequestHandler);
router.post("/logout", UserController.logout.bind(UserController) as RequestHandler);
router.get("/me", authenticateUser, UserController.me.bind(UserController) as RequestHandler);

export default router;
