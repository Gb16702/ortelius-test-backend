import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

export function chatAuthorizationMiddleware(req: Request, res: Response, next: NextFunction) {
  const headerValue = req.headers["chat-authorization-id"];
  let  chatAuthorizationID: string | undefined = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  let setNewHeader = false;

  if (!chatAuthorizationID) {
    chatAuthorizationID = crypto.randomBytes(16).toString("hex");
    setNewHeader = true;
    req.headers["chat-authorization-id"] = chatAuthorizationID;
  }

  const originSend = res.send.bind(res);
  res.send = (body?: any) => {
    if(setNewHeader && chatAuthorizationID) {
      res.setHeader("chat-authorization-id", chatAuthorizationID);
      res.setHeader(
        "Set-Cookie",
        `chat-authorization-id=${chatAuthorizationID}; Path=/; HttpOnly; SameSite=lax; Domain=localhost`
      )
    }

    return originSend(body);
  }

  next();
}
