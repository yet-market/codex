/**
 * Prompt Analyzer - Integrates Groq client with context tree for intelligent prompt analysis
 * Analyzes user prompts and determines relevant context categories for retrieval
 */

import { getGroqContextClient, type ContextAnalysisRequest, type ContextAnalysisResponse } from './groq-context-client.js';
import { getContextTreeManager, type ContextCategory, CONTEXT_TREE_STRUCTURE } from './context-tree-manager.js';
import { log } from '../logger/log.js';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Enhanced context analysis result with file content
 */
export interface PromptAnalysisResult {
  // Basic analysis from Groq
  relevantCategories: Array<{
    category: string;
    subcategory: string;
    relevance: number;
    reasoning: string;
  }>;
  confidence: number;
  processingTime: number;
  reasoning: string;
  
  // Enhanced with actual context content
  contextContent: ContextContent[];
  totalContextFiles: number;
  contextSummary: string;
  
  // Metadata
  projectInfo?: {
    name: string;
    path: string;
    type: string;
  };
  timestamp: string;
}

/**
 * Context content from files
 */
export interface ContextContent {
  category: string;
  subcategory: string;
  filePath: string;
  content: string;
  relevance: number;
  metadata?: {
    title?: string;
    created?: string;
    modified?: string;
    source?: string;
    confidence?: number;
  };
}

/**
 * Prompt analysis configuration
 */
export interface PromptAnalysisConfig {
  maxContextFiles?: number;
  maxContextLength?: number;
  minRelevanceThreshold?: number;
  includeFileMetadata?: boolean;
  prioritizeRecent?: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<PromptAnalysisConfig> = {
  maxContextFiles: 10,
  maxContextLength: 8000,
  minRelevanceThreshold: 0.3,
  includeFileMetadata: true,
  prioritizeRecent: true
};

/**
 * Error class for prompt analysis operations
 */
export class PromptAnalysisError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'PromptAnalysisError';
  }
}

/**
 * Prompt Analyzer - Main class for analyzing prompts and retrieving context
 */
export class PromptAnalyzer {
  private groqClient = getGroqContextClient();
  private contextManager: any; // Will be initialized per project
  private config: Required<PromptAnalysisConfig>;

  constructor(config: PromptAnalysisConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Analyze a user prompt and retrieve relevant context
   */
  async analyzePrompt(
    prompt: string,
    projectRoot?: string,
    conversationHistory?: string[]
  ): Promise<PromptAnalysisResult> {
    const startTime = Date.now();
    
    try {
      // Initialize context manager for this project
      this.contextManager = getContextTreeManager(projectRoot);
      
      // Ensure context tree exists
      const validation = await this.contextManager.validateContextTree();
      if (!validation.isValid) {
        log(`[PromptAnalyzer] Context tree invalid, attempting to initialize...`);
        await this.contextManager.initializeContextTree();
      }

      // Detect project info
      const projectInfo = this.detectProjectInfo(projectRoot);
      
      // Prepare Groq analysis request
      const analysisRequest: ContextAnalysisRequest = {
        prompt,
        conversationHistory,
        projectInfo
      };

      // Get context category analysis from Groq
      const groqAnalysis = await this.groqClient.analyzePromptForContext(analysisRequest);
      
      // Retrieve actual context content based on Groq analysis
      const contextContent = await this.retrieveContextContent(groqAnalysis.relevantCategories);
      
      // Generate context summary
      const contextSummary = this.generateContextSummary(contextContent);
      
      const result: PromptAnalysisResult = {
        ...groqAnalysis,
        contextContent,
        totalContextFiles: contextContent.length,
        contextSummary,
        projectInfo,
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - startTime
      };

      log(`[PromptAnalyzer] Analysis completed in ${result.processingTime}ms: ${contextContent.length} context files retrieved`);
      
      return result;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      log(`[PromptAnalyzer] Analysis failed after ${processingTime}ms: ${error}`);
      throw new PromptAnalysisError(`Prompt analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Retrieve context content based on category analysis
   */
  private async retrieveContextContent(
    categories: Array<{ category: string; subcategory: string; relevance: number; reasoning: string }>
  ): Promise<ContextContent[]> {
    const contextContent: ContextContent[] = [];
    
    try {
      // Sort categories by relevance (highest first)
      const sortedCategories = categories
        .filter(cat => cat.relevance >= this.config.minRelevanceThreshold)
        .sort((a, b) => b.relevance - a.relevance);

      for (const categoryInfo of sortedCategories) {
        if (contextContent.length >= this.config.maxContextFiles) {
          break;
        }

        // Validate category exists in our structure
        if (!this.isValidCategory(categoryInfo.category, categoryInfo.subcategory)) {
          log(`[PromptAnalyzer] Invalid category: ${categoryInfo.category}/${categoryInfo.subcategory}`);
          continue;
        }

        // Get path to category/subcategory
        const categoryPath = this.contextManager.getCategoryPath(
          categoryInfo.category as ContextCategory, 
          categoryInfo.subcategory
        );

        if (!existsSync(categoryPath)) {
          log(`[PromptAnalyzer] Category path does not exist: ${categoryPath}`);
          continue;
        }

        // List context files in this category
        const files = readdirSync(categoryPath)
          .filter(file => file.endsWith('.md') && file !== 'README.md')
          .map(file => join(categoryPath, file));

        // Sort files by modification time if prioritizing recent
        if (this.config.prioritizeRecent) {
          files.sort((a, b) => {
            try {
              const statA = require('fs').statSync(a);
              const statB = require('fs').statSync(b);
              return statB.mtime.getTime() - statA.mtime.getTime();
            } catch {
              return 0;
            }
          });
        }

        // Read file contents
        for (const filePath of files) {
          if (contextContent.length >= this.config.maxContextFiles) {
            break;
          }

          try {
            const content = readFileSync(filePath, 'utf-8');
            
            // Skip if content is too long
            if (content.length > this.config.maxContextLength) {
              log(`[PromptAnalyzer] Skipping large file: ${filePath} (${content.length} chars)`);
              continue;
            }

            // Extract metadata if available
            const metadata = this.config.includeFileMetadata ? 
              this.extractFileMetadata(content) : undefined;

            contextContent.push({
              category: categoryInfo.category,
              subcategory: categoryInfo.subcategory,
              filePath,
              content,
              relevance: categoryInfo.relevance,
              metadata
            });

          } catch (error) {
            log(`[PromptAnalyzer] Failed to read context file ${filePath}: ${error}`);
          }
        }
      }

      log(`[PromptAnalyzer] Retrieved ${contextContent.length} context files from ${sortedCategories.length} categories`);
      return contextContent;

    } catch (error) {
      log(`[PromptAnalyzer] Failed to retrieve context content: ${error}`);
      return [];
    }
  }

  /**
   * Validate if category/subcategory exists in our structure
   */
  private isValidCategory(category: string, subcategory: string): boolean {
    const categoryStructure = CONTEXT_TREE_STRUCTURE[category as ContextCategory];
    if (!categoryStructure) {
      return false;
    }
    
    return categoryStructure.includes(subcategory as any);
  }

  /**
   * Extract metadata from file content
   */
  private extractFileMetadata(content: string): ContextContent['metadata'] {
    try {
      // Look for YAML frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (frontmatterMatch) {
        // Simple key-value extraction (not full YAML parsing)
        const frontmatter = frontmatterMatch[1];
        const metadata: any = {};
        
        const lines = frontmatter.split('\n');
        for (const line of lines) {
          const colonIndex = line.indexOf(':');
          if (colonIndex > 0) {
            const key = line.substring(0, colonIndex).trim();
            const value = line.substring(colonIndex + 1).trim();
            metadata[key] = value.replace(/['"]/g, ''); // Remove quotes
          }
        }
        
        return metadata;
      }
      
      // Extract title from first heading
      const titleMatch = content.match(/^#\s+(.+)$/m);
      if (titleMatch) {
        return { title: titleMatch[1] };
      }
      
      return undefined;
      
    } catch (error) {
      log(`[PromptAnalyzer] Failed to extract metadata: ${error}`);
      return undefined;
    }
  }

  /**
   * Generate a summary of retrieved context
   */
  private generateContextSummary(contextContent: ContextContent[]): string {
    if (contextContent.length === 0) {
      return 'No relevant context found.';
    }

    const categorySummary = new Map<string, number>();
    let totalLength = 0;

    for (const content of contextContent) {
      const categoryKey = `${content.category}/${content.subcategory}`;
      categorySummary.set(categoryKey, (categorySummary.get(categoryKey) || 0) + 1);
      totalLength += content.content.length;
    }

    const categoryList = Array.from(categorySummary.entries())
      .map(([category, count]) => `${category} (${count} files)`)
      .join(', ');

    return `Retrieved ${contextContent.length} context files (${Math.round(totalLength / 1000)}k chars) from: ${categoryList}`;
  }

  /**
   * Detect project information from directory structure
   */
  private detectProjectInfo(projectRoot?: string): PromptAnalysisResult['projectInfo'] {
    if (!projectRoot) {
      projectRoot = process.cwd();
    }

    try {
      const packageJsonPath = join(projectRoot, 'package.json');
      const cargoTomlPath = join(projectRoot, 'Cargo.toml');
      const requirementsPath = join(projectRoot, 'requirements.txt');
      const goModPath = join(projectRoot, 'go.mod');

      let projectType = 'Unknown';
      let projectName = require('path').basename(projectRoot);

      // Detect project type and name
      if (existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
          projectName = packageJson.name || projectName;
          projectType = packageJson.type === 'module' ? 'Node.js ES Module' : 'Node.js';
        } catch {
          projectType = 'Node.js';
        }
      } else if (existsSync(cargoTomlPath)) {
        projectType = 'Rust';
        try {
          const cargoContent = readFileSync(cargoTomlPath, 'utf-8');
          const nameMatch = cargoContent.match(/name\s*=\s*"([^"]+)"/);
          if (nameMatch) {
            projectName = nameMatch[1];
          }
        } catch {
          // Keep default name
        }
      } else if (existsSync(requirementsPath)) {
        projectType = 'Python';
      } else if (existsSync(goModPath)) {
        projectType = 'Go';
        try {
          const goModContent = readFileSync(goModPath, 'utf-8');
          const nameMatch = goModContent.match(/module\s+(.+)/);
          if (nameMatch) {
            projectName = nameMatch[1].split('/').pop() || projectName;
          }
        } catch {
          // Keep default name
        }
      }

      return {
        name: projectName,
        path: projectRoot,
        type: projectType
      };

    } catch (error) {
      log(`[PromptAnalyzer] Failed to detect project info: ${error}`);
      return {
        name: 'unknown',
        path: projectRoot || process.cwd(),
        type: 'Unknown'
      };
    }
  }

  /**
   * Get configuration
   */
  getConfig(): Required<PromptAnalysisConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<PromptAnalysisConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

/**
 * Global prompt analyzer instance
 */
let promptAnalyzer: PromptAnalyzer | null = null;

/**
 * Get or create prompt analyzer instance
 */
export function getPromptAnalyzer(config?: PromptAnalysisConfig): PromptAnalyzer {
  if (!promptAnalyzer) {
    promptAnalyzer = new PromptAnalyzer(config);
  }
  return promptAnalyzer;
}

/**
 * Quick analysis function for common use cases
 */
export async function analyzePrompt(
  prompt: string, 
  projectRoot?: string,
  conversationHistory?: string[]
): Promise<PromptAnalysisResult> {
  const analyzer = getPromptAnalyzer();
  return await analyzer.analyzePrompt(prompt, projectRoot, conversationHistory);
}

/**
 * Format context content for injection into AI instructions
 */
export function formatContextForInstructions(analysisResult: PromptAnalysisResult): string {
  if (analysisResult.contextContent.length === 0) {
    return '';
  }

  const sections = [];

  // Add project info if available
  if (analysisResult.projectInfo) {
    sections.push(`## Project Context
- **Project**: ${analysisResult.projectInfo.name}
- **Type**: ${analysisResult.projectInfo.type}
- **Path**: ${analysisResult.projectInfo.path}`);
  }

  // Add context summary
  sections.push(`## Relevant Context
${analysisResult.contextSummary}`);

  // Group context by category
  const contextByCategory = new Map<string, ContextContent[]>();
  for (const content of analysisResult.contextContent) {
    const categoryKey = `${content.category}/${content.subcategory}`;
    if (!contextByCategory.has(categoryKey)) {
      contextByCategory.set(categoryKey, []);
    }
    contextByCategory.get(categoryKey)!.push(content);
  }

  // Format each category
  for (const [categoryKey, contents] of contextByCategory) {
    const [category, subcategory] = categoryKey.split('/');
    sections.push(`### ${category} - ${subcategory.replace(/_/g, ' ')}`);
    
    for (const content of contents) {
      // Format content with metadata if available
      let formattedContent = content.content;
      
      // Remove any existing metadata/frontmatter from display
      formattedContent = formattedContent.replace(/^---\n[\s\S]*?\n---\n/, '');
      
      // Truncate if too long
      if (formattedContent.length > 1000) {
        formattedContent = formattedContent.substring(0, 997) + '...';
      }
      
      sections.push(formattedContent);
    }
  }

  return sections.join('\n\n');
}