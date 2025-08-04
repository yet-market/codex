/**
 * Micro-Chunk Context Manager
 * High-performance storage and retrieval of granular context insights
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { log } from '../logger/log.js';

/**
 * Micro-chunk metadata structure
 */
export interface MicroChunk {
  id: string;
  created: string;
  relevance_keywords: string[];
  confidence: number;
  source: 'user_prompt' | 'reasoning_stream';
  category: string;
  subcategory: string;
  content: string;
  related_chunks?: string[];
}

/**
 * Context insight extracted by Groq
 */
export interface ContextInsight {
  category: string;
  subcategory: string;
  keywords: string[];
  content: string;
  confidence: number;
}

/**
 * In-memory index for fast lookups
 */
interface ContextIndex {
  keywords: Record<string, string[]>;
  categories: Record<string, string[]>;
  recency: string[];
  chunks: Record<string, MicroChunk>;
}

/**
 * Complete context tree structure
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
 * Micro-Chunk Manager - High-performance context storage and retrieval
 */
export class MicroChunkManager {
  private contextRoot: string | null = null;
  private index: ContextIndex = {
    keywords: {},
    categories: {},
    recency: [],
    chunks: {}
  };
  private chunkCounter = 0;

  constructor() {
    this.loadIndex();
  }

  /**
   * Initialize context tree and load existing index
   */
  public async initialize(workingDirectory: string): Promise<void> {
    this.contextRoot = this.findContextRoot(workingDirectory);
    
    // Create directory structure
    await this.ensureContextTree();
    
    // Load existing chunks into memory
    await this.buildIndex();
    
    log(`[MicroChunk] Initialized with ${Object.keys(this.index.chunks).length} chunks`);
  }

  /**
   * Store multiple insights as micro-chunks (background operation)
   */
  public async storeInsights(
    insights: ContextInsight[],
    source: 'user_prompt' | 'reasoning_stream'
  ): Promise<void> {
    if (!this.contextRoot) {
      throw new Error('MicroChunkManager not initialized');
    }

    // Process in background to avoid blocking
    setImmediate(async () => {
      for (const insight of insights) {
        try {
          await this.storeChunk(insight, source);
        } catch (error) {
          log(`[MicroChunk] Failed to store insight: ${error}`);
        }
      }
    });
  }

  /**
   * Retrieve relevant chunks for user prompt
   */
  public async retrieveRelevantChunks(
    keywords: string[],
    categories: string[],
    maxChunks: number = 6
  ): Promise<MicroChunk[]> {
    const startTime = Date.now();
    
    // Score all chunks
    const scoredChunks = this.scoreChunks(keywords, categories);
    
    // Get top chunks
    const topChunks = scoredChunks
      .sort((a, b) => b.score - a.score)
      .slice(0, maxChunks)
      .map(item => item.chunk);

    const retrievalTime = Date.now() - startTime;
    console.log(`📦 [MicroChunk] RETRIEVED ${topChunks.length} chunks in ${retrievalTime}ms`);
    log(`[MicroChunk] Retrieved ${topChunks.length} chunks in ${retrievalTime}ms`);
    
    return topChunks;
  }

  /**
   * Store a single insight as micro-chunk
   */
  private async storeChunk(
    insight: ContextInsight,
    source: 'user_prompt' | 'reasoning_stream'
  ): Promise<void> {
    if (!this.contextRoot) return;

    // Generate unique ID
    const id = `${insight.category.toLowerCase()}-${insight.subcategory}-${String(++this.chunkCounter).padStart(3, '0')}`;
    
    // Create chunk
    const chunk: MicroChunk = {
      id,
      created: new Date().toISOString(),
      relevance_keywords: insight.keywords,
      confidence: insight.confidence,
      source,
      category: insight.category,
      subcategory: insight.subcategory,
      content: insight.content.substring(0, 300) // Limit content size
    };

    // Create file path
    const categoryPath = join(this.contextRoot, insight.category, insight.subcategory);
    mkdirSync(categoryPath, { recursive: true });
    
    const filePath = join(categoryPath, `${id}.md`);
    
    // Create markdown content
    const markdown = this.formatChunkAsMarkdown(chunk);
    
    // Write file
    writeFileSync(filePath, markdown, 'utf-8');
    
    // Update index
    this.updateIndex(chunk);
    
    console.log(`💾 [MicroChunk] STORED: ${id} (${insight.content.length} chars) in ${insight.category}/${insight.subcategory}`);
    log(`[MicroChunk] Stored: ${id} (${insight.content.length} chars)`);
  }

  /**
   * Score chunks by relevance to keywords and categories
   */
  private scoreChunks(keywords: string[], categories: string[]): Array<{chunk: MicroChunk, score: number}> {
    const results: Array<{chunk: MicroChunk, score: number}> = [];
    
    for (const [chunkId, chunk] of Object.entries(this.index.chunks)) {
      let score = 0;
      
      // Keyword matching (40% weight)
      const keywordMatches = keywords.filter(keyword => 
        chunk.relevance_keywords.some(chunkKeyword => 
          chunkKeyword.toLowerCase().includes(keyword.toLowerCase()) ||
          keyword.toLowerCase().includes(chunkKeyword.toLowerCase())
        )
      ).length;
      score += (keywordMatches / keywords.length) * 0.4;
      
      // Category matching (30% weight)
      const categoryKey = `${chunk.category}/${chunk.subcategory}`;
      const categoryMatch = categories.some(cat => 
        cat.toLowerCase().includes(categoryKey.toLowerCase()) ||
        categoryKey.toLowerCase().includes(cat.toLowerCase())
      );
      if (categoryMatch) score += 0.3;
      
      // Recency boost (20% weight)
      const recencyIndex = this.index.recency.indexOf(chunkId);
      if (recencyIndex !== -1) {
        const recencyScore = 1 - (recencyIndex / this.index.recency.length);
        score += recencyScore * 0.2;
      }
      
      // Confidence (10% weight)
      score += chunk.confidence * 0.1;
      
      if (score > 0) {
        results.push({ chunk, score });
      }
    }
    
    return results;
  }

  /**
   * Update in-memory index with new chunk
   */
  private updateIndex(chunk: MicroChunk): void {
    // Add to chunks
    this.index.chunks[chunk.id] = chunk;
    
    // Update keyword index
    for (const keyword of chunk.relevance_keywords) {
      if (!this.index.keywords[keyword]) {
        this.index.keywords[keyword] = [];
      }
      this.index.keywords[keyword].push(chunk.id);
    }
    
    // Update category index
    const categoryKey = `${chunk.category}/${chunk.subcategory}`;
    if (!this.index.categories[categoryKey]) {
      this.index.categories[categoryKey] = [];
    }
    this.index.categories[categoryKey].push(chunk.id);
    
    // Update recency (add to front, limit to 1000 most recent)
    this.index.recency.unshift(chunk.id);
    if (this.index.recency.length > 1000) {
      this.index.recency = this.index.recency.slice(0, 1000);
    }
  }

  /**
   * Build index from existing files
   */
  private async buildIndex(): Promise<void> {
    if (!this.contextRoot || !existsSync(this.contextRoot)) return;
    
    let loadedChunks = 0;
    
    for (const [category, subcategories] of Object.entries(CONTEXT_CATEGORIES)) {
      for (const subcategory of subcategories) {
        const categoryPath = join(this.contextRoot, category, subcategory);
        
        if (!existsSync(categoryPath)) continue;
        
        try {
          const files = readdirSync(categoryPath)
            .filter(file => file.endsWith('.md'))
            .sort() // Consistent ordering
            .slice(-100); // Limit to most recent 100 per category
          
          for (const file of files) {
            try {
              const filePath = join(categoryPath, file);
              const content = readFileSync(filePath, 'utf-8');
              const chunk = this.parseChunkFromMarkdown(content, category, subcategory);
              
              if (chunk) {
                this.index.chunks[chunk.id] = chunk;
                this.updateIndex(chunk);
                loadedChunks++;
                
                // Update counter to avoid ID conflicts
                const numMatch = chunk.id.match(/-(\d+)$/);
                if (numMatch) {
                  this.chunkCounter = Math.max(this.chunkCounter, parseInt(numMatch[1]));
                }
              }
            } catch (error) {
              log(`[MicroChunk] Failed to load chunk ${file}: ${error}`);
            }
          }
        } catch (error) {
          log(`[MicroChunk] Failed to read category ${category}/${subcategory}: ${error}`);
        }
      }
    }
    
    log(`[MicroChunk] Loaded ${loadedChunks} existing chunks into index`);
  }

  /**
   * Parse chunk from markdown file
   */
  private parseChunkFromMarkdown(
    markdown: string, 
    category: string, 
    subcategory: string
  ): MicroChunk | null {
    try {
      const lines = markdown.split('\n');
      const frontmatterEnd = lines.findIndex((line, idx) => idx > 0 && line === '---');
      
      if (frontmatterEnd === -1) return null;
      
      const frontmatter = lines.slice(1, frontmatterEnd);
      const content = lines.slice(frontmatterEnd + 1).join('\n').trim();
      
      const chunk: Partial<MicroChunk> = { category, subcategory };
      
      for (const line of frontmatter) {
        const [key, ...valueParts] = line.split(':');
        const value = valueParts.join(':').trim();
        
        switch (key) {
          case 'id':
            chunk.id = value;
            break;
          case 'created':
            chunk.created = value;
            break;
          case 'relevance_keywords':
            chunk.relevance_keywords = JSON.parse(value);
            break;
          case 'confidence':
            chunk.confidence = parseFloat(value);
            break;
          case 'source':
            chunk.source = value as 'user_prompt' | 'reasoning_stream';
            break;
        }
      }
      
      // Extract content (skip markdown title)
      const contentLines = content.split('\n');
      const titleIndex = contentLines.findIndex(line => line.startsWith('# '));
      const actualContent = titleIndex !== -1 
        ? contentLines.slice(titleIndex + 1).join('\n').trim()
        : content;
      
      chunk.content = actualContent.replace(/\*Generated by.*$/, '').trim();
      
      return chunk.id ? chunk as MicroChunk : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Format chunk as markdown file
   */
  private formatChunkAsMarkdown(chunk: MicroChunk): string {
    return `---
id: ${chunk.id}
created: ${chunk.created}
relevance_keywords: ${JSON.stringify(chunk.relevance_keywords)}
confidence: ${chunk.confidence}
source: ${chunk.source}
---

# ${chunk.id.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}

${chunk.content}

*Generated by Smart Context from ${chunk.source === 'reasoning_stream' ? 'AI reasoning analysis' : 'user prompt analysis'}*`;
  }

  /**
   * Find context root directory
   */
  private findContextRoot(workingDirectory: string): string {
    let dir = workingDirectory;
    while (dir !== dirname(dir)) {
      if (existsSync(join(dir, '.git'))) {
        return join(dir, '.codex-context');
      }
      dir = dirname(dir);
    }
    return join(workingDirectory, '.codex-context');
  }

  /**
   * Ensure context tree structure exists
   */
  private async ensureContextTree(): Promise<void> {
    if (!this.contextRoot) return;
    
    for (const [category, subcategories] of Object.entries(CONTEXT_CATEGORIES)) {
      for (const subcategory of subcategories) {
        const path = join(this.contextRoot, category, subcategory);
        mkdirSync(path, { recursive: true });
      }
    }
  }

  /**
   * Load saved index (placeholder for future persistence)
   */
  private loadIndex(): void {
    // Future: Load index from disk for faster startup
  }

  /**
   * Get index statistics
   */
  public getStats(): {
    totalChunks: number;
    keywords: number;
    categories: number;
    recentChunks: number;
  } {
    return {
      totalChunks: Object.keys(this.index.chunks).length,
      keywords: Object.keys(this.index.keywords).length,
      categories: Object.keys(this.index.categories).length,
      recentChunks: this.index.recency.length
    };
  }
}

// Global instance
let microChunkManager: MicroChunkManager | null = null;

/**
 * Get or create micro-chunk manager instance
 */
export function getMicroChunkManager(): MicroChunkManager {
  if (!microChunkManager) {
    microChunkManager = new MicroChunkManager();
  }
  return microChunkManager;
}