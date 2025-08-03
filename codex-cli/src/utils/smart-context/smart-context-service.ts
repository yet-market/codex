/**
 * Smart Context Service - Main integration point for Codex
 * Provides simplified interface for context analysis and retrieval
 */

import OpenAI from 'openai';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { log } from '../logger/log.js';
import { getApiKey, getBaseUrl } from '../config.js';

/**
 * Context analysis result
 */
export interface SmartContextResult {
  enhancedInstructions: string;
  contextSummary: string;
  categoriesUsed: string[];
  processingTime: number;
  success: boolean;
  error?: string;
}

/**
 * Context category structure
 */
const CONTEXT_CATEGORIES = {
  PROJECT_RULES: ['coding_standards', 'architecture_decisions', 'naming_conventions', 'business_logic'],
  DECISIONS: ['technical_choices', 'tool_selections', 'implementation_strategies', 'design_patterns'],
  SOLUTIONS: ['common_problems', 'bug_fixes', 'optimization_techniques', 'integration_patterns'],
  FAILED_ATTEMPTS: ['approaches_that_failed', 'antipatterns', 'known_limitations', 'error_prone_methods'],
  TROUBLESHOOTING: ['error_resolutions', 'debugging_strategies', 'common_issues', 'diagnostic_techniques'],
  BEST_PRACTICES: ['performance_tips', 'security_guidelines', 'maintainability_rules', 'testing_strategies'],
  KNOWLEDGE: ['domain_expertise', 'tool_knowledge', 'framework_specifics', 'integration_knowledge']
} as const;

/**
 * Smart Context Service - Simplified interface for Codex integration
 */
export class SmartContextService {
  private groqClient: OpenAI | null = null;
  private contextRoot: string | null = null;
  private isEnabled: boolean = false;

  constructor() {
    this.initialize();
  }

  /**
   * Initialize the service
   */
  private initialize(): void {
    try {
      // Check if Groq API key is available
      const groqApiKey = getApiKey('groq');
      if (!groqApiKey || groqApiKey === '') {
        log('[SmartContext] Groq API key not found - smart context disabled');
        return;
      }

      // Initialize Groq client
      this.groqClient = new OpenAI({
        apiKey: groqApiKey,
        baseURL: getBaseUrl('groq') || 'https://api.groq.com/openai/v1'
      });

      this.isEnabled = true;
      log('[SmartContext] Service initialized successfully');

    } catch (error) {
      log(`[SmartContext] Initialization failed: ${error}`);
      this.isEnabled = false;
    }
  }

  /**
   * Check if smart context is available
   */
  public isAvailable(): boolean {
    return this.isEnabled && this.groqClient !== null;
  }

  /**
   * Enhance instructions with smart context
   */
  public async enhanceInstructions(
    originalInstructions: string,
    userPrompt: string,
    workingDirectory: string
  ): Promise<SmartContextResult> {
    const startTime = Date.now();

    // Return original if not available
    if (!this.isAvailable()) {
      return {
        enhancedInstructions: originalInstructions,
        contextSummary: 'Smart context not available',
        categoriesUsed: [],
        processingTime: Date.now() - startTime,
        success: false,
        error: 'Smart context service not initialized'
      };
    }

    try {
      // Ensure context tree exists
      await this.ensureContextTree(workingDirectory);

      // Analyze prompt for relevant context
      const analysis = await this.analyzePrompt(userPrompt, workingDirectory);
      
      if (analysis.categories.length === 0) {
        // No relevant context found
        return {
          enhancedInstructions: originalInstructions,
          contextSummary: 'No relevant context found',
          categoriesUsed: [],
          processingTime: Date.now() - startTime,
          success: true
        };
      }

      // Retrieve context content
      const contextContent = await this.retrieveContextContent(analysis.categories);

      // Build enhanced instructions
      const enhancedInstructions = this.buildEnhancedInstructions(
        originalInstructions,
        contextContent,
        workingDirectory
      );

      const result: SmartContextResult = {
        enhancedInstructions,
        contextSummary: `Retrieved ${contextContent.length} context files from ${analysis.categories.length} categories`,
        categoriesUsed: analysis.categories.map(c => `${c.category}/${c.subcategory}`),
        processingTime: Date.now() - startTime,
        success: true
      };

      log(`[SmartContext] Enhanced instructions (${result.processingTime}ms): ${result.contextSummary}`);
      return result;

    } catch (error) {
      log(`[SmartContext] Enhancement failed: ${error}`);
      return {
        enhancedInstructions: originalInstructions,
        contextSummary: 'Context enhancement failed',
        categoriesUsed: [],
        processingTime: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Ensure context tree exists
   */
  private async ensureContextTree(workingDirectory: string): Promise<void> {
    this.contextRoot = this.findContextRoot(workingDirectory);
    
    if (!existsSync(this.contextRoot)) {
      // Create basic context structure
      for (const [category, subcategories] of Object.entries(CONTEXT_CATEGORIES)) {
        for (const subcategory of subcategories) {
          const path = join(this.contextRoot, category, subcategory);
          mkdirSync(path, { recursive: true });
        }
      }
      log(`[SmartContext] Created context tree at: ${this.contextRoot}`);
    }
  }

  /**
   * Find context root directory
   */
  private findContextRoot(workingDirectory: string): string {
    // Look for .git directory to find project root
    let dir = workingDirectory;
    while (dir !== dirname(dir)) {
      if (existsSync(join(dir, '.git'))) {
        return join(dir, '.codex-context');
      }
      dir = dirname(dir);
    }
    // Fallback to working directory
    return join(workingDirectory, '.codex-context');
  }

  /**
   * Analyze prompt with Groq
   */
  private async analyzePrompt(prompt: string, workingDirectory: string): Promise<{
    categories: Array<{ category: string; subcategory: string; relevance: number }>;
    confidence: number;
  }> {
    if (!this.groqClient) {
      throw new Error('Groq client not initialized');
    }

    const systemPrompt = `You are a context analyzer. Analyze user prompts and identify relevant context categories.

AVAILABLE CATEGORIES:
${Object.entries(CONTEXT_CATEGORIES).map(([cat, subs]) => 
  `${cat}: ${subs.join(', ')}`
).join('\n')}

Analyze the prompt and select 2-4 most relevant categories.
Respond with JSON:
{
  "categories": [
    {"category": "SOLUTIONS", "subcategory": "bug_fixes", "relevance": 0.9}
  ],
  "confidence": 0.8
}`;

    const response = await this.groqClient.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Analyze: "${prompt}"` }
      ],
      temperature: 0.1,
      max_tokens: 500
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from Groq');
    }

    try {
      const parsed = JSON.parse(content);
      return {
        categories: parsed.categories || [],
        confidence: parsed.confidence || 0.5
      };
    } catch (error) {
      log(`[SmartContext] Failed to parse Groq response: ${content}`);
      return { categories: [], confidence: 0 };
    }
  }

  /**
   * Retrieve context content from files
   */
  private async retrieveContextContent(categories: Array<{
    category: string; 
    subcategory: string; 
    relevance: number;
  }>): Promise<Array<{
    category: string;
    subcategory: string;
    content: string;
    relevance: number;
  }>> {
    if (!this.contextRoot) {
      return [];
    }

    const contextContent = [];

    for (const categoryInfo of categories.slice(0, 4)) { // Limit to 4 categories
      const categoryPath = join(this.contextRoot, categoryInfo.category, categoryInfo.subcategory);
      
      if (!existsSync(categoryPath)) {
        continue;
      }

      try {
        const files = readdirSync(categoryPath)
          .filter(file => file.endsWith('.md') && file !== 'README.md')
          .slice(0, 2); // Limit to 2 files per category

        for (const file of files) {
          const filePath = join(categoryPath, file);
          const content = readFileSync(filePath, 'utf-8');
          
          // Skip very large files
          if (content.length > 5000) {
            continue;
          }

          contextContent.push({
            category: categoryInfo.category,
            subcategory: categoryInfo.subcategory,
            content: this.cleanContextContent(content),
            relevance: categoryInfo.relevance
          });

          // Limit total context files
          if (contextContent.length >= 6) {
            break;
          }
        }
      } catch (error) {
        log(`[SmartContext] Failed to read category ${categoryInfo.category}/${categoryInfo.subcategory}: ${error}`);
      }

      if (contextContent.length >= 6) {
        break;
      }
    }

    return contextContent;
  }

  /**
   * Clean context content for AI consumption
   */
  private cleanContextContent(content: string): string {
    // Remove frontmatter
    let cleaned = content.replace(/^---\n[\s\S]*?\n---\n/, '');
    
    // Limit length
    if (cleaned.length > 1000) {
      cleaned = cleaned.substring(0, 997) + '...';
    }
    
    return cleaned.trim();
  }

  /**
   * Build enhanced instructions with context
   */
  private buildEnhancedInstructions(
    originalInstructions: string,
    contextContent: Array<{
      category: string;
      subcategory: string;
      content: string;
      relevance: number;
    }>,
    workingDirectory: string
  ): string {
    if (contextContent.length === 0) {
      return originalInstructions;
    }

    // Build context section
    const contextSections = [];
    
    contextSections.push('## Smart Context Information');
    contextSections.push(`Retrieved ${contextContent.length} relevant context files for this request:`);

    // Group by category
    const byCategory = new Map<string, typeof contextContent>();
    for (const item of contextContent) {
      const key = `${item.category}/${item.subcategory}`;
      if (!byCategory.has(key)) {
        byCategory.set(key, []);
      }
      byCategory.get(key)!.push(item);
    }

    // Format each category
    for (const [categoryKey, items] of byCategory) {
      const [category, subcategory] = categoryKey.split('/');
      contextSections.push(`### ${category} - ${subcategory.replace(/_/g, ' ')}`);
      
      for (const item of items) {
        contextSections.push(item.content);
      }
    }

    const contextSection = contextSections.join('\n\n');
    
    // Combine with original instructions
    return `${originalInstructions}

${contextSection}

---
*The above context information should be considered when responding to the user's request. Use this context to provide more accurate, consistent, and helpful assistance.*`;
  }

  /**
   * Analyze prompt for storage opportunities
   */
  public async analyzePromptForStorage(prompt: string): Promise<{
    items: Array<{
      category: string;
      subcategory: string;
      content: string;
      title: string;
      confidence: number;
    }>;
    confidence: number;
  }> {
    if (!this.groqClient) {
      throw new Error('Groq client not initialized');
    }

    const systemPrompt = `You are a context extraction expert. Analyze user prompts and extract valuable information to store in a knowledge base.

CATEGORIES AVAILABLE:
${Object.entries(CONTEXT_CATEGORIES).map(([cat, subs]) => 
  `${cat}: ${subs.join(', ')}`
).join('\n')}

Extract 1-3 pieces of valuable information from the prompt. Focus on:
- Rules, standards, or guidelines mentioned
- Technical decisions or preferences  
- Solutions to problems
- Best practices or methodologies
- Domain knowledge or insights

Respond with JSON:
{
  "items": [
    {
      "category": "PROJECT_RULES",
      "subcategory": "coding_standards", 
      "title": "Authentication Validation Rules",
      "content": "Always validate user inputs before processing authentication...",
      "confidence": 0.8
    }
  ],
  "confidence": 0.7
}

Return empty items array if nothing valuable to store.`;

    const response = await this.groqClient.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Extract context from: "${prompt}"` }
      ],
      temperature: 0.1,
      max_tokens: 800
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from Groq');
    }

    try {
      const parsed = JSON.parse(content);
      return {
        items: parsed.items || [],
        confidence: parsed.confidence || 0.5
      };
    } catch (error) {
      log(`[SmartContext] Failed to parse storage analysis: ${content}`);
      return { items: [], confidence: 0 };
    }
  }

  /**
   * Store context items to files
   */
  public async storeContextItems(items: Array<{
    category: string;
    subcategory: string;
    content: string;
    title: string;
    confidence: number;
  }>, workingDirectory: string, source: string = 'user_prompt'): Promise<number> {
    if (!this.contextRoot) {
      this.contextRoot = this.findContextRoot(workingDirectory);
    }

    let filesCreated = 0;

    for (const item of items) {
      try {
        const categoryPath = join(this.contextRoot, item.category, item.subcategory);
        
        // Ensure directory exists
        mkdirSync(categoryPath, { recursive: true });
        
        // Create filename from title
        const filename = item.title
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .substring(0, 50) + '.md';
        
        const filepath = join(categoryPath, filename);
        
        // Check if file already exists
        if (existsSync(filepath)) {
          continue; // Skip if already exists
        }
        
        // Create markdown content
        const sourceDescription = source === 'reasoning_stream' ? 'AI reasoning analysis' : 'user prompt analysis';
        const markdown = `---
title: ${item.title}
created: ${new Date().toISOString()}
source: ${source}
confidence: ${item.confidence}
---

# ${item.title}

${item.content}

*Generated by Smart Context from ${sourceDescription}*`;

        writeFileSync(filepath, markdown, 'utf-8');
        filesCreated++;
        
        log(`[SmartContext] Stored: ${item.category}/${item.subcategory}/${filename}`);
        
      } catch (error) {
        log(`[SmartContext] Failed to store item ${item.title}: ${error}`);
      }
    }

    return filesCreated;
  }

  /**
   * Make ensureContextTree public for external access
   */
  public async ensureContextTreePublic(workingDirectory: string): Promise<void> {
    return this.ensureContextTree(workingDirectory);
  }

  /**
   * Analyze reasoning stream for valuable insights
   */
  public async analyzeReasoningStream(reasoningContent: string, context: {
    userPrompt?: string;
    success?: boolean;
    errorOccurred?: boolean;
  }): Promise<{
    items: Array<{
      category: string;
      subcategory: string;
      content: string;
      title: string;
      confidence: number;
    }>;
    confidence: number;
  }> {
    if (!this.groqClient) {
      throw new Error('Groq client not initialized');
    }

    // Skip if reasoning content is too short or empty
    if (!reasoningContent || reasoningContent.length < 20) {
      log(`[SmartContext] Skipping reasoning stream: ${reasoningContent?.length || 0} chars (minimum 20)`);
      return { items: [], confidence: 0 };
    }

    const systemPrompt = `You are an AI reasoning analyzer. Analyze AI reasoning streams and extract valuable insights for future reference.

CATEGORIES AVAILABLE:
${Object.entries(CONTEXT_CATEGORIES).map(([cat, subs]) => 
  `${cat}: ${subs.join(', ')}`
).join('\n')}

Extract valuable insights from the AI's reasoning process. Focus on:
- Approaches that worked well (SOLUTIONS, BEST_PRACTICES)
- Methods that failed or had issues (FAILED_ATTEMPTS, TROUBLESHOOTING)
- Decision-making processes (DECISIONS, PROJECT_RULES)
- Technical knowledge demonstrated (KNOWLEDGE)

Context: ${context.userPrompt ? `User asked: "${context.userPrompt}"` : 'No user prompt'}
Result: ${context.success ? 'SUCCESS' : context.errorOccurred ? 'ERROR' : 'UNKNOWN'}

Respond with JSON:
{
  "items": [
    {
      "category": "SOLUTIONS",
      "subcategory": "debugging_strategies",
      "title": "Effective Error Analysis Approach",
      "content": "When debugging, first check dependencies, then validate input parameters...",
      "confidence": 0.7
    }
  ],
  "confidence": 0.6
}

Extract 0-2 most valuable insights. Prioritize unique or sophisticated approaches.`;

    try {
      const response = await this.groqClient.chat.completions.create({
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
        return { items: [], confidence: 0 };
      }

      try {
        const parsed = JSON.parse(content);
        return {
          items: parsed.items || [],
          confidence: parsed.confidence || 0.5
        };
      } catch (error) {
        log(`[SmartContext] Failed to parse reasoning analysis: ${content.substring(0, 200)}...`);
        return { items: [], confidence: 0 };
      }

    } catch (error) {
      log(`[SmartContext] Reasoning analysis failed: ${error}`);
      return { items: [], confidence: 0 };
    }
  }

  /**
   * Store insights from reasoning stream
   */
  public async processReasoningStream(
    reasoningContent: string,
    context: {
      userPrompt?: string;
      success?: boolean;
      errorOccurred?: boolean;
    },
    workingDirectory: string
  ): Promise<{
    stored: boolean;
    itemsStored: number;
    processingTime: number;
    error?: string;
  }> {
    const startTime = Date.now();

    if (!this.isAvailable()) {
      return {
        stored: false,
        itemsStored: 0,
        processingTime: Date.now() - startTime,
        error: 'Smart context service not available'
      };
    }

    try {
      // Ensure context tree exists
      await this.ensureContextTreePublic(workingDirectory);

      // Analyze reasoning stream
      const analysis = await this.analyzeReasoningStream(reasoningContent, context);

      if (analysis.items.length === 0) {
        return {
          stored: false,
          itemsStored: 0,
          processingTime: Date.now() - startTime
        };
      }

      // Store insights with reasoning stream source
      const itemsStored = await this.storeContextItems(analysis.items, workingDirectory, 'reasoning_stream');

      log(`[SmartContext] Processed reasoning stream: ${itemsStored} insights stored`);

      return {
        stored: itemsStored > 0,
        itemsStored,
        processingTime: Date.now() - startTime
      };

    } catch (error) {
      return {
        stored: false,
        itemsStored: 0,
        processingTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
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
      log(`[SmartContext] Connection test failed: ${error}`);
      return false;
    }
  }
}

/**
 * Global service instance
 */
let smartContextService: SmartContextService | null = null;

/**
 * Get or create smart context service
 */
export function getSmartContextService(): SmartContextService {
  if (!smartContextService) {
    smartContextService = new SmartContextService();
  }
  return smartContextService;
}

/**
 * Context storage result
 */
export interface ContextStorageResult {
  stored: boolean;
  categoriesUsed: string[];
  filesCreated: number;
  processingTime: number;
  error?: string;
}

/**
 * Store context information from user prompt
 */
async function storeContextFromPrompt(
  userPrompt: string,
  workingDirectory: string
): Promise<ContextStorageResult> {
  const startTime = Date.now();
  const service = getSmartContextService();
  
  if (!service.isAvailable()) {
    return {
      stored: false,
      categoriesUsed: [],
      filesCreated: 0,
      processingTime: Date.now() - startTime,
      error: 'Smart context service not available'
    };
  }

  try {
    // Ensure context tree exists
    await service.ensureContextTreePublic(workingDirectory);
    
    // Analyze prompt for storage opportunities
    const storageAnalysis = await service.analyzePromptForStorage(userPrompt);
    
    if (storageAnalysis.items.length === 0) {
      return {
        stored: false,
        categoriesUsed: [],
        filesCreated: 0,
        processingTime: Date.now() - startTime
      };
    }

    // Store context items
    const filesCreated = await service.storeContextItems(storageAnalysis.items, workingDirectory);
    
    return {
      stored: true,
      categoriesUsed: storageAnalysis.items.map(item => `${item.category}/${item.subcategory}`),
      filesCreated,
      processingTime: Date.now() - startTime
    };

  } catch (error) {
    return {
      stored: false,
      categoriesUsed: [],
      filesCreated: 0,
      processingTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Helper function for quick context enhancement with optional storage
 */
export async function enhanceInstructionsWithContext(
  originalInstructions: string,
  userPrompt: string,
  workingDirectory: string,
  options: { storeContext?: boolean } = {}
): Promise<SmartContextResult & { storageResult?: ContextStorageResult }> {
  const service = getSmartContextService();
  
  // Get context enhancement
  const enhancementResult = await service.enhanceInstructions(originalInstructions, userPrompt, workingDirectory);
  
  // Optionally store context from this prompt
  let storageResult: ContextStorageResult | undefined;
  if (options.storeContext && enhancementResult.success) {
    try {
      storageResult = await storeContextFromPrompt(userPrompt, workingDirectory);
      if (storageResult.stored) {
        log(`[SmartContext] Stored context: ${storageResult.filesCreated} files in ${storageResult.categoriesUsed.length} categories`);
      }
    } catch (error) {
      log(`[SmartContext] Context storage failed: ${error}`);
    }
  }
  
  return {
    ...enhancementResult,
    storageResult
  };
}

/**
 * Helper function to process reasoning stream in the background
 */
export async function processReasoningStreamInBackground(
  reasoningContent: string,
  context: {
    userPrompt?: string;
    success?: boolean;
    errorOccurred?: boolean;
  },
  workingDirectory: string
): Promise<void> {
  const service = getSmartContextService();
  
  if (!service.isAvailable()) {
    return;
  }

  try {
    // Process reasoning stream in the background without blocking
    const result = await service.processReasoningStream(reasoningContent, context, workingDirectory);
    
    if (result.stored) {
      log(`[SmartContext] Background processing: ${result.itemsStored} reasoning insights stored`);
    }
  } catch (error) {
    log(`[SmartContext] Background reasoning processing failed: ${error}`);
    // Don't throw - this is background processing
  }
}