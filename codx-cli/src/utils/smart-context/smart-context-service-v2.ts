/**
 * Enhanced Smart Context Service V2 - High-performance micro-chunk system
 * Real-time learning from user prompts and AI reasoning
 */

import { log } from '../logger/log.js';
import { getMicroChunkManager, type MicroChunk } from './micro-chunk-manager.js';
import { getInsightExtractor } from './insight-extractor.js';

/**
 * Enhanced context analysis result
 */
export interface EnhancedSmartContextResult {
  enhancedInstructions: string;
  contextSummary: string;
  chunksUsed: number;
  keywords: string[];
  categories: string[];
  processingTime: number;
  success: boolean;
  error?: string;
}

/**
 * Context storage result
 */
export interface ContextStorageResult {
  stored: boolean;
  insightsStored: number;
  source: 'user_prompt' | 'reasoning_stream';
  processingTime: number;
  error?: string;
}

/**
 * Enhanced Smart Context Service V2
 */
export class EnhancedSmartContextService {
  private microChunkManager = getMicroChunkManager();
  private insightExtractor = getInsightExtractor();
  private isInitialized = false;

  constructor() {
    // Initialization happens on first use
  }

  /**
   * Initialize the service
   */
  private async ensureInitialized(workingDirectory: string): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.microChunkManager.initialize(workingDirectory);
      this.isInitialized = true;
      log('[SmartContextV2] Service initialized successfully');
    } catch (error) {
      log(`[SmartContextV2] Initialization failed: ${error}`);
      throw error;
    }
  }

  /**
   * Check if smart context is available
   */
  public isAvailable(): boolean {
    return this.insightExtractor.isAvailable();
  }

  /**
   * Enhance instructions with relevant micro-chunks
   */
  public async enhanceInstructions(
    originalInstructions: string,
    userPrompt: string,
    workingDirectory: string
  ): Promise<EnhancedSmartContextResult> {
    const startTime = Date.now();

    if (!this.isAvailable()) {
      return {
        enhancedInstructions: originalInstructions,
        contextSummary: 'Smart context not available',
        chunksUsed: 0,
        keywords: [],
        categories: [],
        processingTime: Date.now() - startTime,
        success: false,
        error: 'Smart context service not available'
      };
    }

    try {
      await this.ensureInitialized(workingDirectory);

      // Extract keywords and categories for retrieval
      const { keywords, categories } = await this.insightExtractor.extractRetrievalQuery(userPrompt);
      
      if (keywords.length === 0 && categories.length === 0) {
        return {
          enhancedInstructions: originalInstructions,
          contextSummary: 'No relevant context query generated',
          chunksUsed: 0,
          keywords: [],
          categories: [],
          processingTime: Date.now() - startTime,
          success: true
        };
      }

      // Retrieve relevant chunks
      const relevantChunks = await this.microChunkManager.retrieveRelevantChunks(
        keywords,
        categories,
        6 // Max chunks
      );

      if (relevantChunks.length === 0) {
        return {
          enhancedInstructions: originalInstructions,
          contextSummary: 'No relevant context found',
          chunksUsed: 0,
          keywords,
          categories,
          processingTime: Date.now() - startTime,
          success: true
        };
      }

      // Build enhanced instructions
      const enhancedInstructions = this.buildEnhancedInstructions(
        originalInstructions,
        relevantChunks
      );

      const result: EnhancedSmartContextResult = {
        enhancedInstructions,
        contextSummary: `Applied ${relevantChunks.length} context insights`,
        chunksUsed: relevantChunks.length,
        keywords,
        categories,
        processingTime: Date.now() - startTime,
        success: true
      };

      log(`[SmartContextV2] Enhanced instructions (${result.processingTime}ms): ${result.contextSummary}`);
      return result;

    } catch (error) {
      log(`[SmartContextV2] Enhancement failed: ${error}`);
      return {
        enhancedInstructions: originalInstructions,
        contextSummary: 'Context enhancement failed',
        chunksUsed: 0,
        keywords: [],
        categories: [],
        processingTime: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Store insights from user prompt (background operation)
   */
  public async storeFromPrompt(
    userPrompt: string,
    workingDirectory: string,
    context?: { projectType?: string; previousContext?: string }
  ): Promise<ContextStorageResult> {
    const startTime = Date.now();

    if (!this.isAvailable()) {
      return {
        stored: false,
        insightsStored: 0,
        source: 'user_prompt',
        processingTime: Date.now() - startTime,
        error: 'Smart context service not available'
      };
    }

    try {
      await this.ensureInitialized(workingDirectory);

      // Extract insights from prompt
      const insights = await this.insightExtractor.extractFromPrompt(userPrompt, context);

      if (insights.length === 0) {
        return {
          stored: false,
          insightsStored: 0,
          source: 'user_prompt',
          processingTime: Date.now() - startTime
        };
      }

      // Store insights (background operation)
      await this.microChunkManager.storeInsights(insights, 'user_prompt');

      const result: ContextStorageResult = {
        stored: true,
        insightsStored: insights.length,
        source: 'user_prompt',
        processingTime: Date.now() - startTime
      };

      console.log(`✅ [SmartContextV2] STORED ${insights.length} insights from user prompt successfully!`);
      log(`[SmartContextV2] Stored ${insights.length} insights from user prompt`);
      return result;

    } catch (error) {
      log(`[SmartContextV2] Prompt storage failed: ${error}`);
      return {
        stored: false,
        insightsStored: 0,
        source: 'user_prompt',
        processingTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Store insights from AI reasoning (background operation)
   */
  public async storeFromReasoning(
    reasoningContent: string,
    workingDirectory: string,
    context?: {
      userPrompt?: string;
      success?: boolean;
      errorOccurred?: boolean;
      modelUsed?: string;
    }
  ): Promise<ContextStorageResult> {
    const startTime = Date.now();

    if (!this.isAvailable()) {
      return {
        stored: false,
        insightsStored: 0,
        source: 'reasoning_stream',
        processingTime: Date.now() - startTime,
        error: 'Smart context service not available'
      };
    }

    try {
      await this.ensureInitialized(workingDirectory);

      // Extract insights from reasoning
      const insights = await this.insightExtractor.extractFromReasoning(reasoningContent, context);

      if (insights.length === 0) {
        return {
          stored: false,
          insightsStored: 0,
          source: 'reasoning_stream',
          processingTime: Date.now() - startTime
        };
      }

      // Store insights (background operation)
      await this.microChunkManager.storeInsights(insights, 'reasoning_stream');

      const result: ContextStorageResult = {
        stored: true,
        insightsStored: insights.length,
        source: 'reasoning_stream',
        processingTime: Date.now() - startTime
      };

      console.log(`✅ [SmartContextV2] STORED ${insights.length} insights from AI reasoning successfully!`);
      log(`[SmartContextV2] Stored ${insights.length} insights from AI reasoning`);
      return result;

    } catch (error) {
      log(`[SmartContextV2] Reasoning storage failed: ${error}`);
      return {
        stored: false,
        insightsStored: 0,
        source: 'reasoning_stream',
        processingTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Build enhanced instructions with context chunks
   */
  private buildEnhancedInstructions(
    originalInstructions: string,
    chunks: MicroChunk[]
  ): string {
    if (chunks.length === 0) {
      return originalInstructions;
    }

    // Group chunks by category for better organization
    const chunksByCategory = new Map<string, MicroChunk[]>();
    for (const chunk of chunks) {
      const categoryKey = `${chunk.category}/${chunk.subcategory}`;
      if (!chunksByCategory.has(categoryKey)) {
        chunksByCategory.set(categoryKey, []);
      }
      chunksByCategory.get(categoryKey)!.push(chunk);
    }

    // Build context section
    const contextSections: string[] = [];
    contextSections.push('## Smart Context Insights');
    contextSections.push(`Applied ${chunks.length} relevant insights from previous interactions:`);

    for (const [categoryKey, categoryChunks] of chunksByCategory) {
      const [category, subcategory] = categoryKey.split('/');
      const categoryTitle = `${category.replace(/_/g, ' ')} - ${subcategory.replace(/_/g, ' ')}`;
      
      contextSections.push(`### ${categoryTitle}`);
      
      for (const chunk of categoryChunks.slice(0, 2)) { // Max 2 chunks per category
        contextSections.push(`- ${chunk.content}`);
      }
    }

    const contextSection = contextSections.join('\n\n');

    // Combine with original instructions
    return `${originalInstructions}

${contextSection}

---
*The above context insights are based on previous interactions and should inform your response. Use this accumulated knowledge to provide more accurate, consistent, and helpful assistance.*`;
  }

  /**
   * Get system statistics
   */
  public getStats(): {
    available: boolean;
    initialized: boolean;
    chunks: number;
    keywords: number;
    categories: number;
  } {
    const stats = this.microChunkManager.getStats();
    
    return {
      available: this.isAvailable(),
      initialized: this.isInitialized,
      chunks: stats.totalChunks,
      keywords: stats.keywords,
      categories: stats.categories
    };
  }

  /**
   * Test all system components
   */
  public async testSystem(): Promise<{
    insightExtractor: boolean;
    microChunkManager: boolean;
    overall: boolean;
  }> {
    const insightExtractorTest = await this.insightExtractor.testConnection();
    const microChunkManagerTest = true; // Always available (file-based)
    
    return {
      insightExtractor: insightExtractorTest,
      microChunkManager: microChunkManagerTest,
      overall: insightExtractorTest && microChunkManagerTest
    };
  }
}

// Global instance
let enhancedSmartContextService: EnhancedSmartContextService | null = null;

/**
 * Get or create enhanced smart context service
 */
export function getEnhancedSmartContextService(): EnhancedSmartContextService {
  if (!enhancedSmartContextService) {
    enhancedSmartContextService = new EnhancedSmartContextService();
  }
  return enhancedSmartContextService;
}

/**
 * Helper function for quick context enhancement
 */
export async function enhanceInstructionsWithMicroChunks(
  originalInstructions: string,
  userPrompt: string,
  workingDirectory: string
): Promise<EnhancedSmartContextResult> {
  const service = getEnhancedSmartContextService();
  return await service.enhanceInstructions(originalInstructions, userPrompt, workingDirectory);
}

/**
 * Helper function to store insights from prompt (background)
 */
export async function storeInsightsFromPrompt(
  userPrompt: string,
  workingDirectory: string,
  context?: { projectType?: string; previousContext?: string }
): Promise<void> {
  const service = getEnhancedSmartContextService();
  
  // Run in background without blocking
  setImmediate(async () => {
    try {
      await service.storeFromPrompt(userPrompt, workingDirectory, context);
    } catch (error) {
      log(`[SmartContextV2] Background prompt storage failed: ${error}`);
    }
  });
}

/**
 * Helper function to store insights from reasoning (background)
 */
export async function storeInsightsFromReasoning(
  reasoningContent: string,
  workingDirectory: string,
  context?: {
    userPrompt?: string;
    success?: boolean;
    errorOccurred?: boolean;
    modelUsed?: string;
  }
): Promise<void> {
  const service = getEnhancedSmartContextService();
  
  // Run in background without blocking
  setImmediate(async () => {
    try {
      await service.storeFromReasoning(reasoningContent, workingDirectory, context);
    } catch (error) {
      log(`[SmartContextV2] Background reasoning storage failed: ${error}`);
    }
  });
}