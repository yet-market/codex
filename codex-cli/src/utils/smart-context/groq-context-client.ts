/**
 * Groq Context Client - Dedicated client for smart context operations
 * Uses Groq Llama 3.1 8B for fast, cost-effective context analysis
 */

import OpenAI from "openai";
import { getApiKey, getBaseUrl } from "../config.js";
import { log } from "../logger/log.js";

export interface ContextAnalysisRequest {
  prompt: string;
  conversationHistory?: string[];
  projectInfo?: {
    name: string;
    path: string;
    type: string;
  };
}

export interface ContextCategory {
  category: string;
  subcategory: string;
  relevance: number;
  reasoning: string;
}

export interface ContextAnalysisResponse {
  relevantCategories: ContextCategory[];
  confidence: number;
  processingTime: number;
  reasoning: string;
}

export interface ContextStorageRequest {
  content: string;
  contentType: 'user_prompt' | 'reasoning_stream';
  projectInfo?: {
    name: string;
    path: string;
    type: string;
  };
}

export interface ContextStorageItem {
  category: string;
  subcategory: string;
  content: string;
  confidence: number;
  reasoning: string;
}

export interface ContextStorageResponse {
  items: ContextStorageItem[];
  totalItems: number;
  processingTime: number;
}

/**
 * Error types for Groq Context Client operations
 */
export class GroqContextError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'GroqContextError';
  }
}

/**
 * Groq Context Client - Handles all smart context operations
 */
export class GroqContextClient {
  private client: OpenAI;
  private model: string = 'llama-3.1-8b-instant';
  private maxRetries: number = 3;
  private timeoutMs: number = 30000;

  constructor() {
    const apiKey = getApiKey('groq');
    const baseURL = getBaseUrl('groq');

    if (!apiKey) {
      throw new GroqContextError('Groq API key not found. Please set GROQ_API_KEY environment variable.');
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: baseURL || 'https://api.groq.com/openai/v1',
      timeout: this.timeoutMs,
    });

    log(`[GroqContextClient] Initialized with model: ${this.model}`);
  }

  /**
   * Test connection to Groq API
   */
  async testConnection(): Promise<boolean> {
    try {
      const startTime = Date.now();
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1,
        temperature: 0,
      });
      
      const duration = Date.now() - startTime;
      log(`[GroqContextClient] Connection test successful (${duration}ms)`);
      
      return response.choices?.[0]?.message?.content !== undefined;
    } catch (error) {
      log(`[GroqContextClient] Connection test failed: ${error}`);
      return false;
    }
  }

  /**
   * Analyze user prompt to determine relevant context categories
   */
  async analyzePromptForContext(request: ContextAnalysisRequest): Promise<ContextAnalysisResponse> {
    const startTime = Date.now();
    
    try {
      const systemPrompt = this.buildContextAnalysisPrompt();
      const userPrompt = this.buildUserAnalysisPrompt(request);

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 1000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new GroqContextError('Empty response from Groq API');
      }

      const result = this.parseContextAnalysisResponse(content);
      const processingTime = Date.now() - startTime;

      log(`[GroqContextClient] Context analysis completed (${processingTime}ms): ${result.relevantCategories.length} categories identified`);

      return {
        ...result,
        processingTime
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      log(`[GroqContextClient] Context analysis failed after ${processingTime}ms: ${error}`);
      throw new GroqContextError(`Context analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Analyze content for storage in context system
   */
  async analyzeContentForStorage(request: ContextStorageRequest): Promise<ContextStorageResponse> {
    const startTime = Date.now();
    
    try {
      const systemPrompt = this.buildStorageAnalysisPrompt();
      const userPrompt = this.buildStorageUserPrompt(request);

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 1500,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new GroqContextError('Empty response from Groq API');
      }

      const result = this.parseStorageAnalysisResponse(content);
      const processingTime = Date.now() - startTime;

      log(`[GroqContextClient] Storage analysis completed (${processingTime}ms): ${result.items.length} items to store`);

      return {
        ...result,
        processingTime
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      log(`[GroqContextClient] Storage analysis failed after ${processingTime}ms: ${error}`);
      throw new GroqContextError(`Storage analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Build system prompt for context analysis (retrieval)
   */
  private buildContextAnalysisPrompt(): string {
    return `You are a specialized AI context analyst. Your job is to analyze user prompts and determine which context categories would be most helpful for an AI coding assistant.

CONTEXT CATEGORIES AVAILABLE:
1. PROJECT_RULES (coding_standards, architecture_decisions, naming_conventions, business_logic)
2. DECISIONS (technical_choices, tool_selections, implementation_strategies, design_patterns)  
3. SOLUTIONS (common_problems, bug_fixes, optimization_techniques, integration_patterns)
4. FAILED_ATTEMPTS (approaches_that_failed, antipatterns, known_limitations, error_prone_methods)
5. TROUBLESHOOTING (error_resolutions, debugging_strategies, common_issues, diagnostic_techniques)
6. BEST_PRACTICES (performance_tips, security_guidelines, maintainability_rules, testing_strategies)
7. KNOWLEDGE (domain_expertise, tool_knowledge, framework_specifics, integration_knowledge)

ANALYZE THE USER PROMPT AND:
1. Identify 2-4 most relevant context categories/subcategories
2. Assign relevance scores (0.0-1.0) based on how helpful each would be
3. Provide clear reasoning for each selection
4. Rate your overall confidence (0.0-1.0)

RESPOND IN VALID JSON FORMAT:
{
  "relevantCategories": [
    {
      "category": "SOLUTIONS",
      "subcategory": "bug_fixes", 
      "relevance": 0.9,
      "reasoning": "User is asking about fixing a specific error"
    }
  ],
  "confidence": 0.85,
  "reasoning": "Overall analysis reasoning"
}`;
  }

  /**
   * Build user prompt for context analysis
   */
  private buildUserAnalysisPrompt(request: ContextAnalysisRequest): string {
    let prompt = `ANALYZE THIS USER PROMPT FOR RELEVANT CONTEXT:

USER PROMPT: "${request.prompt}"`;

    if (request.projectInfo) {
      prompt += `\n\nPROJECT INFO:
- Name: ${request.projectInfo.name}
- Type: ${request.projectInfo.type}
- Path: ${request.projectInfo.path}`;
    }

    if (request.conversationHistory && request.conversationHistory.length > 0) {
      prompt += `\n\nRECENT CONVERSATION:
${request.conversationHistory.slice(-3).join('\n')}`;
    }

    return prompt;
  }

  /**
   * Build system prompt for storage analysis
   */
  private buildStorageAnalysisPrompt(): string {
    return `You are a specialized AI knowledge extraction expert. Your job is to analyze content (user prompts or AI reasoning) and extract valuable information that should be stored in a hierarchical context system.

CONTEXT CATEGORIES FOR STORAGE:
1. PROJECT_RULES (coding_standards, architecture_decisions, naming_conventions, business_logic)
2. DECISIONS (technical_choices, tool_selections, implementation_strategies, design_patterns)
3. SOLUTIONS (common_problems, bug_fixes, optimization_techniques, integration_patterns)
4. FAILED_ATTEMPTS (approaches_that_failed, antipatterns, known_limitations, error_prone_methods)
5. TROUBLESHOOTING (error_resolutions, debugging_strategies, common_issues, diagnostic_techniques)
6. BEST_PRACTICES (performance_tips, security_guidelines, maintainability_rules, testing_strategies)
7. KNOWLEDGE (domain_expertise, tool_knowledge, framework_specifics, integration_knowledge)

EXTRACT AND CATEGORIZE:
1. Important decisions, rules, or requirements
2. Solutions and techniques that worked
3. Failed approaches and why they failed
4. Best practices and guidelines
5. Domain knowledge and insights

FOR EACH EXTRACTED ITEM:
- Choose the most appropriate category/subcategory
- Extract clean, reusable content
- Assign confidence score (0.0-1.0)
- Provide reasoning for categorization

RESPOND IN VALID JSON FORMAT:
{
  "items": [
    {
      "category": "SOLUTIONS",
      "subcategory": "bug_fixes",
      "content": "Clean, actionable content to store",
      "confidence": 0.9,
      "reasoning": "Why this belongs in this category"
    }
  ],
  "totalItems": 1
}`;
  }

  /**
   * Build user prompt for storage analysis
   */
  private buildStorageUserPrompt(request: ContextStorageRequest): string {
    let prompt = `ANALYZE THIS CONTENT FOR VALUABLE INFORMATION TO STORE:

CONTENT TYPE: ${request.contentType}
CONTENT: "${request.content}"`;

    if (request.projectInfo) {
      prompt += `\n\nPROJECT CONTEXT:
- Name: ${request.projectInfo.name}
- Type: ${request.projectInfo.type}
- Path: ${request.projectInfo.path}`;
    }

    return prompt;
  }

  /**
   * Parse context analysis response from Groq
   */
  private parseContextAnalysisResponse(content: string): Omit<ContextAnalysisResponse, 'processingTime'> {
    try {
      const parsed = JSON.parse(content);
      
      if (!parsed.relevantCategories || !Array.isArray(parsed.relevantCategories)) {
        throw new Error('Invalid response format: missing relevantCategories array');
      }

      // Validate each category
      for (const category of parsed.relevantCategories) {
        if (!category.category || !category.subcategory || typeof category.relevance !== 'number') {
          throw new Error('Invalid category format in response');
        }
      }

      return {
        relevantCategories: parsed.relevantCategories,
        confidence: parsed.confidence || 0.5,
        reasoning: parsed.reasoning || 'No reasoning provided'
      };

    } catch (error) {
      log(`[GroqContextClient] Failed to parse context analysis response: ${error}`);
      log(`[GroqContextClient] Raw response: ${content}`);
      
      // Return fallback response
      return {
        relevantCategories: [],
        confidence: 0.0,
        reasoning: `Failed to parse response: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Parse storage analysis response from Groq
   */
  private parseStorageAnalysisResponse(content: string): Omit<ContextStorageResponse, 'processingTime'> {
    try {
      const parsed = JSON.parse(content);
      
      if (!parsed.items || !Array.isArray(parsed.items)) {
        throw new Error('Invalid response format: missing items array');
      }

      // Validate each item
      for (const item of parsed.items) {
        if (!item.category || !item.subcategory || !item.content || typeof item.confidence !== 'number') {
          throw new Error('Invalid item format in response');
        }
      }

      return {
        items: parsed.items,
        totalItems: parsed.items.length
      };

    } catch (error) {
      log(`[GroqContextClient] Failed to parse storage analysis response: ${error}`);
      log(`[GroqContextClient] Raw response: ${content}`);
      
      // Return fallback response
      return {
        items: [],
        totalItems: 0
      };
    }
  }
}

/**
 * Singleton instance for global use
 */
let groqContextClient: GroqContextClient | null = null;

/**
 * Get or create Groq Context Client instance
 */
export function getGroqContextClient(): GroqContextClient {
  if (!groqContextClient) {
    groqContextClient = new GroqContextClient();
  }
  return groqContextClient;
}

/**
 * Test if Groq Context Client is available and working
 */
export async function testGroqContextClient(): Promise<boolean> {
  try {
    const client = getGroqContextClient();
    return await client.testConnection();
  } catch (error) {
    log(`[GroqContextClient] Availability test failed: ${error}`);
    return false;
  }
}