/**
 * Abstract Reasoning Handler - Supports multiple AI provider reasoning formats
 * Unified interface for extracting reasoning content from different models
 */

export interface ReasoningContent {
  content: string;
  provider: string;
  model: string;
  format: string;
  confidence: number; // 0-1, how confident we are this is reasoning content
}

export interface ReasoningItem {
  type?: string;
  reasoning?: any;
  summary?: any;
  content?: any;
  encrypted_content?: any;
  thought_summary?: any;
  chain_of_thought?: any;
  thinking?: any;
  [key: string]: any;
}

/**
 * Abstract base class for reasoning extractors
 */
export abstract class ReasoningExtractor {
  abstract readonly provider: string;
  abstract readonly supportedModels: string[];
  
  /**
   * Check if this extractor can handle the given model
   */
  canHandle(model: string): boolean {
    return this.supportedModels.some(supported => 
      model.toLowerCase().includes(supported.toLowerCase())
    );
  }
  
  /**
   * Extract reasoning content from response item
   */
  abstract extract(item: ReasoningItem): ReasoningContent | null;
  
  /**
   * Check if item contains reasoning content
   */
  abstract hasReasoning(item: ReasoningItem): boolean;
}

/**
 * OpenAI Reasoning Extractor (o1, o3 models)
 */
export class OpenAIReasoningExtractor extends ReasoningExtractor {
  readonly provider = "openai";
  readonly supportedModels = ["o1", "o3", "gpt-4o-reasoning"];
  
  hasReasoning(item: ReasoningItem): boolean {
    return item.type === "reasoning" || 
           (item.summary !== undefined) ||
           (item.encrypted_content !== undefined);
  }
  
  extract(item: ReasoningItem): ReasoningContent | null {
    let content = null;
    let format = "unknown";
    
    // Try different OpenAI reasoning formats
    if (Array.isArray(item.summary) && item.summary.length > 0) {
      content = item.summary.join(' ');
      format = "summary_array";
    } else if (typeof item.summary === 'string') {
      content = item.summary;
      format = "summary_string";
    } else if (typeof item.content === 'string') {
      content = item.content;
      format = "content_field";
    } else if (typeof item.encrypted_content === 'string') {
      content = item.encrypted_content;
      format = "encrypted_content";
    }
    
    if (!content) return null;
    
    return {
      content,
      provider: this.provider,
      model: "openai-reasoning",
      format,
      confidence: 0.9
    };
  }
}

/**
 * Google Gemini Reasoning Extractor (Gemini 2.5 Pro thought summaries)
 */
export class GeminiReasoningExtractor extends ReasoningExtractor {
  readonly provider = "gemini";
  readonly supportedModels = ["gemini-2.5", "gemini-2.0-flash-thinking", "gemini-pro"];
  
  hasReasoning(item: ReasoningItem): boolean {
    return !!(item.reasoning || 
              item.thought_summary || 
              item.thinking ||
              (item.type === "message" && item.reasoning) ||
              // Check content array for reasoning
              (item.type === "message" && Array.isArray(item.content) && 
               item.content.some((c: any) => c.reasoning)));
  }
  
  extract(item: ReasoningItem): ReasoningContent | null {
    let content = null;
    let format = "unknown";
    
    // Try different Gemini reasoning formats
    if (item.reasoning && typeof item.reasoning === 'string') {
      content = item.reasoning;
      format = "reasoning_field";
    } else if (item.reasoning && typeof item.reasoning === 'object') {
      if (item.reasoning.content) {
        content = item.reasoning.content;
        format = "reasoning_object_content";
      } else if (item.reasoning.summary) {
        content = item.reasoning.summary;
        format = "reasoning_object_summary";
      }
    } else if (item.thought_summary) {
      content = typeof item.thought_summary === 'string' ? 
                item.thought_summary : 
                JSON.stringify(item.thought_summary);
      format = "thought_summary";
    } else if (item.thinking) {
      content = typeof item.thinking === 'string' ? 
                item.thinking : 
                JSON.stringify(item.thinking);
      format = "thinking_field";
    }
    
    if (!content) return null;
    
    return {
      content,
      provider: this.provider,
      model: "gemini",
      format,
      confidence: 0.85
    };
  }
}

/**
 * Anthropic Claude Reasoning Extractor (Extended thinking)
 */
export class ClaudeReasoningExtractor extends ReasoningExtractor {
  readonly provider = "claude";
  readonly supportedModels = ["claude-3.7", "claude-opus-4", "claude-sonnet-4"];
  
  hasReasoning(item: ReasoningItem): boolean {
    return !!(item.thinking || 
              item.extended_thinking ||
              (item.type === "thinking"));
  }
  
  extract(item: ReasoningItem): ReasoningContent | null {
    let content = null;
    let format = "unknown";
    
    if (item.thinking) {
      content = typeof item.thinking === 'string' ? 
                item.thinking : 
                JSON.stringify(item.thinking);
      format = "thinking";
    } else if (item.extended_thinking) {
      content = typeof item.extended_thinking === 'string' ? 
                item.extended_thinking : 
                JSON.stringify(item.extended_thinking);
      format = "extended_thinking";
    }
    
    if (!content) return null;
    
    return {
      content,
      provider: this.provider,
      model: "claude",
      format,
      confidence: 0.85
    };
  }
}

/**
 * DeepSeek Reasoning Extractor (Chain of Thought)
 */
export class DeepSeekReasoningExtractor extends ReasoningExtractor {
  readonly provider = "deepseek";
  readonly supportedModels = ["deepseek-reasoner", "deepseek-r1"];
  
  hasReasoning(item: ReasoningItem): boolean {
    return !!(item.reasoning_content || 
              item.chain_of_thought ||
              item.cot ||
              item.reasoning ||
              // Check for message content with reasoning from streaming
              (item.type === "message" && Array.isArray(item.content) && 
               item.content.some((c: any) => c.reasoning)));
  }
  
  extract(item: ReasoningItem): ReasoningContent | null {
    let content = null;
    let format = "unknown";
    
    // Try direct reasoning field first (from accumulated streaming)
    if (item.reasoning) {
      content = typeof item.reasoning === 'string' ? 
                item.reasoning : 
                JSON.stringify(item.reasoning);
      format = "reasoning_field";
    } else if (item.reasoning_content) {
      content = typeof item.reasoning_content === 'string' ? 
                item.reasoning_content : 
                JSON.stringify(item.reasoning_content);
      format = "reasoning_content";
    } else if (item.chain_of_thought) {
      content = typeof item.chain_of_thought === 'string' ? 
                item.chain_of_thought : 
                JSON.stringify(item.chain_of_thought);
      format = "chain_of_thought";
    } else if (item.cot) {
      content = typeof item.cot === 'string' ? 
                item.cot : 
                JSON.stringify(item.cot);
      format = "cot";
    } else if (item.type === "message" && Array.isArray(item.content)) {
      // Check content array for reasoning
      for (const contentItem of item.content) {
        if (contentItem.reasoning) {
          content = typeof contentItem.reasoning === 'string' ? 
                    contentItem.reasoning : 
                    JSON.stringify(contentItem.reasoning);
          format = "content_reasoning";
          break;
        }
      }
    }
    
    if (!content) return null;
    
    return {
      content,
      provider: this.provider,
      model: "deepseek",
      format,
      confidence: 0.8
    };
  }
}

/**
 * Universal Reasoning Handler - Manages all extractors
 */
export class UniversalReasoningHandler {
  private extractors: ReasoningExtractor[] = [
    new OpenAIReasoningExtractor(),
    new GeminiReasoningExtractor(),
    new ClaudeReasoningExtractor(),
    new DeepSeekReasoningExtractor()
  ];
  
  /**
   * Extract reasoning content from any provider format
   */
  extractReasoning(item: ReasoningItem, model?: string): ReasoningContent | null {
    // Try model-specific extractor first
    if (model) {
      const specificExtractor = this.extractors.find(e => e.canHandle(model));
      if (specificExtractor && specificExtractor.hasReasoning(item)) {
        const result = specificExtractor.extract(item);
        if (result) {
          console.log(`🧠 [UniversalReasoning] Extracted using ${specificExtractor.provider} extractor`);
          return result;
        }
      }
    }
    
    // Try all extractors if no specific match
    for (const extractor of this.extractors) {
      if (extractor.hasReasoning(item)) {
        const result = extractor.extract(item);
        if (result) {
          console.log(`🧠 [UniversalReasoning] Extracted using ${extractor.provider} extractor (fallback)`);
          return result;
        }
      }
    }
    
    return null;
  }
  
  /**
   * Debug: Show what fields are available in item
   */
  debugItem(item: ReasoningItem): void {
    console.log(`🔍 [UniversalReasoning] Item keys:`, Object.keys(item));
    console.log(`🔍 [UniversalReasoning] Item type:`, item.type);
    
    // Check for reasoning fields specifically
    if ((item as any).reasoning) {
      console.log(`🔍 [UniversalReasoning] FOUND reasoning field: ${typeof (item as any).reasoning}, length: ${typeof (item as any).reasoning === 'string' ? (item as any).reasoning.length : 'N/A'}`);
    }
    if (item.reasoning_content) {
      console.log(`🔍 [UniversalReasoning] FOUND reasoning_content field`);
    }
    if (Array.isArray(item.content)) {
      console.log(`🔍 [UniversalReasoning] Content is array with ${item.content.length} items`);
      item.content.forEach((c: any, idx: number) => {
        if ((c as any).reasoning) {
          console.log(`🔍 [UniversalReasoning] FOUND reasoning in content[${idx}]`);
        }
      });
    }
    
    // Check each extractor
    for (const extractor of this.extractors) {
      const hasReasoning = extractor.hasReasoning(item);
      console.log(`🔍 [UniversalReasoning] ${extractor.provider} detects reasoning: ${hasReasoning}`);
    }
  }
  
  /**
   * Add custom extractor for new providers
   */
  addExtractor(extractor: ReasoningExtractor): void {
    this.extractors.push(extractor);
  }
}

// Global instance
export const universalReasoningHandler = new UniversalReasoningHandler();