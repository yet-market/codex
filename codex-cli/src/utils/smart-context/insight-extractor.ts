/**
 * Insight Extractor - Uses Groq to analyze prompts and reasoning for context insights
 * Extracts micro-chunks of valuable information for storage
 */

import OpenAI from 'openai';
import { getApiKey, getBaseUrl } from '../config.js';
import { log } from '../logger/log.js';
import type { ContextInsight } from './micro-chunk-manager.js';

/**
 * Analysis result from Groq
 */
interface GroqAnalysisResult {
  insights: ContextInsight[];
  confidence: number;
}

/**
 * Context categories for Groq analysis
 */
const GROQ_CATEGORIES = `
PROJECT_RULES (what we must follow):
- coding_standards, architecture_decisions, naming_conventions, business_logic

DECISIONS (what we chose and why):
- technical_choices, tool_selections, implementation_strategies, design_patterns

SOLUTIONS (what worked):
- common_problems, bug_fixes, optimization_techniques, integration_patterns

FAILED_ATTEMPTS (what didn't work):
- approaches_that_failed, antipatterns, known_limitations, error_prone_methods

TROUBLESHOOTING (how to fix problems):
- error_resolutions, debugging_strategies, common_issues, diagnostic_techniques

BEST_PRACTICES (how to do it right):
- performance_tips, security_guidelines, maintainability_rules, testing_strategies

KNOWLEDGE (what we learned):
- domain_expertise, tool_knowledge, framework_specifics, integration_knowledge
`;

/**
 * Insight Extractor using Groq Llama 3.1 8B
 */
export class InsightExtractor {
  private groqClient: OpenAI | null = null;
  private isEnabled: boolean = false;

  constructor() {
    this.initialize();
  }

  /**
   * Initialize Groq client
   */
  private initialize(): void {
    try {
      const groqApiKey = getApiKey('groq');
      if (!groqApiKey || groqApiKey === '') {
        log('[InsightExtractor] Groq API key not found - insight extraction disabled');
        return;
      }

      this.groqClient = new OpenAI({
        apiKey: groqApiKey,
        baseURL: getBaseUrl('groq') || 'https://api.groq.com/openai/v1'
      });

      this.isEnabled = true;
      log('[InsightExtractor] Initialized successfully');
    } catch (error) {
      log(`[InsightExtractor] Initialization failed: ${error}`);
      this.isEnabled = false;
    }
  }

  /**
   * Check if insight extraction is available
   */
  public isAvailable(): boolean {
    return this.isEnabled && this.groqClient !== null;
  }

  /**
   * Extract insights from user prompt
   */
  public async extractFromPrompt(
    userPrompt: string,
    context?: { projectType?: string; previousContext?: string }
  ): Promise<ContextInsight[]> {
    if (!this.isAvailable()) {
      return [];
    }

    const systemPrompt = `You are a context insight extractor. Analyze user prompts and extract 1-3 key insights worth storing for future reference.

AVAILABLE CATEGORIES:
${GROQ_CATEGORIES}

Extract insights that capture:
- Rules, standards, or guidelines mentioned
- Technical decisions or preferences  
- Solutions to problems or approaches taken
- Best practices or methodologies
- Domain knowledge or specific requirements
- Patterns of user behavior or preferences

For each insight, provide:
- category: One of the main categories (PROJECT_RULES, DECISIONS, etc.)
- subcategory: Specific subcategory from the list
- keywords: 2-4 relevant search keywords
- content: 50-200 character insight (concise and actionable)
- confidence: 0.1-1.0 confidence score

Respond with JSON:
{
  "insights": [
    {
      "category": "SOLUTIONS",
      "subcategory": "bug_fixes",
      "keywords": ["auth", "token", "validation"],
      "content": "Always validate JWT tokens before processing requests to prevent auth bypass.",
      "confidence": 0.8
    }
  ],
  "confidence": 0.7
}

Return empty insights array if nothing valuable to store.`;

    try {
      const response = await this.groqClient!.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Extract insights from user prompt: "${userPrompt}"${context ? `\n\nContext: ${JSON.stringify(context)}` : ''}` }
        ],
        temperature: 0.1,
        max_tokens: 800
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return [];
      }

      try {
        const parsed: GroqAnalysisResult = JSON.parse(content);
        const validInsights = this.validateInsights(parsed.insights || []);
        
        if (validInsights.length > 0) {
          log(`[InsightExtractor] Extracted ${validInsights.length} insights from user prompt`);
        }
        
        return validInsights;
      } catch (parseError) {
        log(`[InsightExtractor] Failed to parse prompt analysis: ${content.substring(0, 100)}...`);
        return [];
      }
    } catch (error) {
      log(`[InsightExtractor] Prompt analysis failed: ${error}`);
      return [];
    }
  }

  /**
   * Extract insights from AI reasoning content
   */
  public async extractFromReasoning(
    reasoningContent: string,
    context?: { 
      userPrompt?: string; 
      success?: boolean; 
      errorOccurred?: boolean;
      modelUsed?: string;
    }
  ): Promise<ContextInsight[]> {
    if (!this.isAvailable() || !reasoningContent || reasoningContent.length < 50) {
      return [];
    }

    const systemPrompt = `You are an AI reasoning analyzer. Extract valuable insights from AI reasoning processes for future reference.

AVAILABLE CATEGORIES:
${GROQ_CATEGORIES}

Focus on extracting insights about:
- Approaches that worked well → SOLUTIONS, BEST_PRACTICES
- Methods that failed or had issues → FAILED_ATTEMPTS, TROUBLESHOOTING  
- Decision-making processes → DECISIONS, PROJECT_RULES
- Technical knowledge demonstrated → KNOWLEDGE
- Problem-solving strategies → TROUBLESHOOTING, SOLUTIONS
- Patterns and methodologies → BEST_PRACTICES

For each insight, provide:
- category: Main category that best fits the insight
- subcategory: Specific subcategory
- keywords: 2-4 relevant search keywords
- content: 50-200 character insight (focus on the approach/method/knowledge)
- confidence: 0.1-1.0 confidence score

Context: ${context?.userPrompt ? `User asked: "${context.userPrompt}"` : 'No user prompt'}
Result: ${context?.success ? 'SUCCESS' : context?.errorOccurred ? 'ERROR' : 'UNKNOWN'}
Model: ${context?.modelUsed || 'Unknown'}

Respond with JSON format. Extract 0-2 most valuable insights. Prioritize unique or sophisticated approaches.`;

    try {
      const response = await this.groqClient!.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analyze this AI reasoning:\n\n${reasoningContent.substring(0, 2000)}` }
        ],
        temperature: 0.2,
        max_tokens: 600
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return [];
      }

      try {
        const parsed: GroqAnalysisResult = JSON.parse(content);
        const validInsights = this.validateInsights(parsed.insights || []);
        
        if (validInsights.length > 0) {
          log(`[InsightExtractor] Extracted ${validInsights.length} insights from AI reasoning`);
        }
        
        return validInsights;
      } catch (parseError) {
        log(`[InsightExtractor] Failed to parse reasoning analysis: ${content.substring(0, 100)}...`);
        return [];
      }
    } catch (error) {
      log(`[InsightExtractor] Reasoning analysis failed: ${error}`);
      return [];
    }
  }

  /**
   * Extract keywords and categories for context retrieval
   */
  public async extractRetrievalQuery(
    userPrompt: string
  ): Promise<{ keywords: string[]; categories: string[] }> {
    if (!this.isAvailable()) {
      return { keywords: [], categories: [] };
    }

    const systemPrompt = `You are a context retrieval analyzer. Analyze user prompts to determine what context would be most helpful.

AVAILABLE CATEGORIES:
${GROQ_CATEGORIES}

For the user prompt, identify:
1. Top 3-5 relevant keywords for searching context
2. Top 2-3 most relevant categories that might contain helpful information

Respond with JSON:
{
  "keywords": ["auth", "token", "validation", "security"],
  "categories": ["SOLUTIONS/bug_fixes", "BEST_PRACTICES/security_guidelines"]
}`;

    try {
      const response = await this.groqClient!.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analyze for context retrieval: "${userPrompt}"` }
        ],
        temperature: 0.1,
        max_tokens: 300
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return { keywords: [], categories: [] };
      }

      try {
        const parsed = JSON.parse(content);
        return {
          keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 5) : [],
          categories: Array.isArray(parsed.categories) ? parsed.categories.slice(0, 3) : []
        };
      } catch (parseError) {
        log(`[InsightExtractor] Failed to parse retrieval query: ${content}`);
        return { keywords: [], categories: [] };
      }
    } catch (error) {
      log(`[InsightExtractor] Retrieval query analysis failed: ${error}`);
      return { keywords: [], categories: [] };
    }
  }

  /**
   * Validate and filter insights
   */
  private validateInsights(insights: any[]): ContextInsight[] {
    const validCategories = [
      'PROJECT_RULES', 'DECISIONS', 'SOLUTIONS', 'FAILED_ATTEMPTS',
      'TROUBLESHOOTING', 'BEST_PRACTICES', 'KNOWLEDGE'
    ];

    const validSubcategories = [
      'coding_standards', 'architecture_decisions', 'naming_conventions', 'business_logic',
      'technical_choices', 'tool_selections', 'implementation_strategies', 'design_patterns',
      'common_problems', 'bug_fixes', 'optimization_techniques', 'integration_patterns',
      'approaches_that_failed', 'antipatterns', 'known_limitations', 'error_prone_methods',
      'error_resolutions', 'debugging_strategies', 'common_issues', 'diagnostic_techniques',
      'performance_tips', 'security_guidelines', 'maintainability_rules', 'testing_strategies',
      'domain_expertise', 'tool_knowledge', 'framework_specifics', 'integration_knowledge'
    ];

    return insights
      .filter(insight => {
        return (
          insight &&
          typeof insight.category === 'string' &&
          typeof insight.subcategory === 'string' &&
          Array.isArray(insight.keywords) &&
          typeof insight.content === 'string' &&
          typeof insight.confidence === 'number' &&
          validCategories.includes(insight.category) &&
          validSubcategories.includes(insight.subcategory) &&
          insight.content.length >= 20 &&
          insight.content.length <= 300 &&
          insight.confidence >= 0.1 &&
          insight.confidence <= 1.0 &&
          insight.keywords.length > 0 &&
          insight.keywords.every((k: any) => typeof k === 'string')
        );
      })
      .slice(0, 3); // Limit to 3 insights max
  }

  /**
   * Test connection to Groq
   */
  public async testConnection(): Promise<boolean> {
    if (!this.groqClient) {
      return false;
    }

    try {
      await this.groqClient.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1
      });
      return true;
    } catch (error) {
      log(`[InsightExtractor] Connection test failed: ${error}`);
      return false;
    }
  }
}

// Global instance
let insightExtractor: InsightExtractor | null = null;

/**
 * Get or create insight extractor instance
 */
export function getInsightExtractor(): InsightExtractor {
  if (!insightExtractor) {
    insightExtractor = new InsightExtractor();
  }
  return insightExtractor;
}