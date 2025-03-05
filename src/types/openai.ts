type MessageRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: MessageRole;
  content: string;
}

export interface SystemMessage extends ChatMessage {
  role: "system";
}

interface OpenAIChoice {
  message: {
    role: MessageRole;
    content: string;
  };
  finish_reason: "stop" | "length" | "content_filter";
  index: number;
}

export interface OpenAIResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}