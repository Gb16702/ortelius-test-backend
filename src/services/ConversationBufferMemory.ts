import { BufferMemory } from "langchain/memory";

export class ConversationBufferMemoryService {
  private memory: BufferMemory;

  constructor() {
    this.memory = new BufferMemory({
      memoryKey: "chat_history",
      inputKey: "input",
      outputKey: "output",
      returnMessages: true,
    });
  }

  public async addTurn(userMessage: string, aiResponse: string): Promise<void> {
    await this.memory.saveContext({ input: userMessage }, { output: aiResponse });
  }

  public async getHistory(): Promise<string> {
    const memoryVars = await this.memory.loadMemoryVariables({});
    return memoryVars.chat_history as string;
  }

  public clearHistory(): Promise<void> {
    return this.memory.clear();
  }
}
