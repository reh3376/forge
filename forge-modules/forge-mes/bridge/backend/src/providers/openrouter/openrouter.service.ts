import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";

export type CreateChatCompletionRequestSettings = Omit<
  OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
  "model" | "messages"
>;

export type ChatCompletionMessageParam = OpenAI.Chat.ChatCompletionMessageParam;

const DEFAULT_SETTINGS: CreateChatCompletionRequestSettings = {
  temperature: 0.7,
  max_tokens: 4096,
  top_p: 1,
  frequency_penalty: 0,
  presence_penalty: 0,
};

@Injectable()
export class OpenRouterService {
  private readonly logger = new Logger(OpenRouterService.name);

  constructor(private readonly configService: ConfigService) {}

  async createChatCompletion(
    messages: ChatCompletionMessageParam[],
    requestSettings?: CreateChatCompletionRequestSettings
  ): Promise<string> {
    const apiKey = this.configService.get<string>("OPENROUTER_API_KEY");
    if (!apiKey) {
      throw new Error(
        "OPENROUTER_API_KEY is not configured. Set it in your environment variables."
      );
    }

    const model =
      this.configService.get<string>("OPENROUTER_MODEL") ||
      "google/gemini-3-flash";

    const openai = new OpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://whiskeyhouse.com",
        "X-Title": "WhiskeyHouse MES Formula Assistant",
      },
    });

    const settings = { ...DEFAULT_SETTINGS, ...requestSettings };

    try {
      const response = await openai.chat.completions.create({
        ...settings,
        model,
        messages,
      });

      return response.choices[0]?.message?.content || "";
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        this.logger.error(
          `OpenRouter API error: ${error.status} ${error.message}`
        );
      }
      throw error;
    }
  }
}
