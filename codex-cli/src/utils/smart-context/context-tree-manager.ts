/**
 * Context Tree Manager - Manages hierarchical context directory structure
 * Creates and maintains the .codex-context tree with all categories and subcategories
 */

import { existsSync, mkdirSync, readdirSync, statSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { log } from '../logger/log.js';

/**
 * Hierarchical context tree structure definition
 */
export const CONTEXT_TREE_STRUCTURE = {
  PROJECT_RULES: [
    'coding_standards',
    'architecture_decisions', 
    'naming_conventions',
    'business_logic'
  ],
  DECISIONS: [
    'technical_choices',
    'tool_selections',
    'implementation_strategies',
    'design_patterns'
  ],
  SOLUTIONS: [
    'common_problems',
    'bug_fixes',
    'optimization_techniques',
    'integration_patterns'
  ],
  FAILED_ATTEMPTS: [
    'approaches_that_failed',
    'antipatterns',
    'known_limitations',
    'error_prone_methods'
  ],
  TROUBLESHOOTING: [
    'error_resolutions',
    'debugging_strategies',
    'common_issues',
    'diagnostic_techniques'
  ],
  BEST_PRACTICES: [
    'performance_tips',
    'security_guidelines',
    'maintainability_rules',
    'testing_strategies'
  ],
  KNOWLEDGE: [
    'domain_expertise',
    'tool_knowledge',
    'framework_specifics',
    'integration_knowledge'
  ]
} as const;

export type ContextCategory = keyof typeof CONTEXT_TREE_STRUCTURE;
export type ContextSubcategory<T extends ContextCategory> = typeof CONTEXT_TREE_STRUCTURE[T][number];

/**
 * Context file metadata
 */
export interface ContextFileMetadata {
  id: string;
  category: string;
  subcategory: string;
  title: string;
  created: string;
  modified: string;
  source: 'user_prompt' | 'reasoning_stream' | 'manual';
  confidence: number;
  tags: string[];
  projectInfo?: {
    name: string;
    path: string;
    type: string;
  };
}

/**
 * Context entry structure
 */
export interface ContextEntry {
  metadata: ContextFileMetadata;
  content: string;
}

/**
 * Context tree initialization result
 */
export interface ContextTreeInitResult {
  success: boolean;
  contextPath: string;
  categoriesCreated: number;
  subcategoriesCreated: number;
  errors: string[];
}

/**
 * Context tree validation result
 */
export interface ContextTreeValidation {
  isValid: boolean;
  contextPath: string;
  missingDirectories: string[];
  invalidFiles: string[];
  repairActions: string[];
}

/**
 * Error class for context tree operations
 */
export class ContextTreeError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'ContextTreeError';
  }
}

/**
 * Context Tree Manager - Handles all context directory operations
 */
export class ContextTreeManager {
  private contextRoot: string;
  private readonly CONTEXT_DIR_NAME = '.codex-context';

  constructor(projectRoot?: string) {
    this.contextRoot = this.discoverContextRoot(projectRoot);
  }

  /**
   * Discover the context root directory
   */
  private discoverContextRoot(projectRoot?: string): string {
    const cwd = projectRoot || process.cwd();
    
    // First, try current directory
    let searchDir = resolve(cwd);
    const contextPath = join(searchDir, this.CONTEXT_DIR_NAME);
    
    if (existsSync(contextPath)) {
      return contextPath;
    }

    // Look for Git root and use that as context root
    let dir = searchDir;
    while (true) {
      const gitPath = join(dir, '.git');
      if (existsSync(gitPath)) {
        // Found Git root - use this as context root
        return join(dir, this.CONTEXT_DIR_NAME);
      }

      const parent = dirname(dir);
      if (parent === dir) {
        // Reached filesystem root - use original cwd
        break;
      }
      dir = parent;
    }

    return join(searchDir, this.CONTEXT_DIR_NAME);
  }

  /**
   * Initialize the complete context tree structure
   */
  async initializeContextTree(): Promise<ContextTreeInitResult> {
    const result: ContextTreeInitResult = {
      success: false,
      contextPath: this.contextRoot,
      categoriesCreated: 0,
      subcategoriesCreated: 0,
      errors: []
    };

    try {
      log(`[ContextTreeManager] Initializing context tree at: ${this.contextRoot}`);

      // Create root context directory
      if (!existsSync(this.contextRoot)) {
        mkdirSync(this.contextRoot, { recursive: true });
        log(`[ContextTreeManager] Created context root: ${this.contextRoot}`);
      }

      // Create all categories and subcategories
      for (const [category, subcategories] of Object.entries(CONTEXT_TREE_STRUCTURE)) {
        try {
          const categoryPath = join(this.contextRoot, category);
          
          if (!existsSync(categoryPath)) {
            mkdirSync(categoryPath, { recursive: true });
            result.categoriesCreated++;
            log(`[ContextTreeManager] Created category: ${category}`);
          }

          // Create subcategories
          for (const subcategory of subcategories) {
            const subcategoryPath = join(categoryPath, subcategory);
            
            if (!existsSync(subcategoryPath)) {
              mkdirSync(subcategoryPath, { recursive: true });
              result.subcategoriesCreated++;
              log(`[ContextTreeManager] Created subcategory: ${category}/${subcategory}`);
            }

            // Create README file if it doesn't exist
            const readmePath = join(subcategoryPath, 'README.md');
            if (!existsSync(readmePath)) {
              const readmeContent = this.generateSubcategoryReadme(category, subcategory);
              writeFileSync(readmePath, readmeContent, 'utf-8');
            }
          }
        } catch (error) {
          const errorMsg = `Failed to create category ${category}: ${error instanceof Error ? error.message : String(error)}`;
          result.errors.push(errorMsg);
          log(`[ContextTreeManager] ${errorMsg}`);
        }
      }

      // Create root README
      const rootReadmePath = join(this.contextRoot, 'README.md');
      if (!existsSync(rootReadmePath)) {
        const rootReadmeContent = this.generateRootReadme();
        writeFileSync(rootReadmePath, rootReadmeContent, 'utf-8');
      }

      result.success = result.errors.length === 0;
      
      log(`[ContextTreeManager] Context tree initialization ${result.success ? 'completed' : 'completed with errors'}`);
      log(`[ContextTreeManager] Created ${result.categoriesCreated} categories, ${result.subcategoriesCreated} subcategories`);

      return result;

    } catch (error) {
      const errorMsg = `Context tree initialization failed: ${error instanceof Error ? error.message : String(error)}`;
      result.errors.push(errorMsg);
      log(`[ContextTreeManager] ${errorMsg}`);
      return result;
    }
  }

  /**
   * Validate context tree structure and integrity
   */
  async validateContextTree(): Promise<ContextTreeValidation> {
    const result: ContextTreeValidation = {
      isValid: true,
      contextPath: this.contextRoot,
      missingDirectories: [],
      invalidFiles: [],
      repairActions: []
    };

    try {
      // Check if context root exists
      if (!existsSync(this.contextRoot)) {
        result.isValid = false;
        result.missingDirectories.push(this.contextRoot);
        result.repairActions.push('Initialize context tree');
        return result;
      }

      // Validate all categories and subcategories
      for (const [category, subcategories] of Object.entries(CONTEXT_TREE_STRUCTURE)) {
        const categoryPath = join(this.contextRoot, category);
        
        if (!existsSync(categoryPath)) {
          result.isValid = false;
          result.missingDirectories.push(categoryPath);
          result.repairActions.push(`Create category: ${category}`);
          continue;
        }

        // Check if it's actually a directory
        if (!statSync(categoryPath).isDirectory()) {
          result.isValid = false;
          result.invalidFiles.push(categoryPath);
          result.repairActions.push(`Remove file and create directory: ${category}`);
          continue;
        }

        // Validate subcategories
        for (const subcategory of subcategories) {
          const subcategoryPath = join(categoryPath, subcategory);
          
          if (!existsSync(subcategoryPath)) {
            result.isValid = false;
            result.missingDirectories.push(subcategoryPath);
            result.repairActions.push(`Create subcategory: ${category}/${subcategory}`);
          } else if (!statSync(subcategoryPath).isDirectory()) {
            result.isValid = false;
            result.invalidFiles.push(subcategoryPath);
            result.repairActions.push(`Remove file and create directory: ${category}/${subcategory}`);
          }
        }
      }

      log(`[ContextTreeManager] Context tree validation ${result.isValid ? 'passed' : 'failed'}`);
      if (!result.isValid) {
        log(`[ContextTreeManager] Missing directories: ${result.missingDirectories.length}`);
        log(`[ContextTreeManager] Invalid files: ${result.invalidFiles.length}`);
      }

      return result;

    } catch (error) {
      log(`[ContextTreeManager] Context tree validation error: ${error}`);
      result.isValid = false;
      result.repairActions.push('Manual inspection required');
      return result;
    }
  }

  /**
   * Repair context tree based on validation results
   */
  async repairContextTree(validation?: ContextTreeValidation): Promise<boolean> {
    try {
      const validationResult = validation || await this.validateContextTree();
      
      if (validationResult.isValid) {
        log(`[ContextTreeManager] Context tree is already valid, no repair needed`);
        return true;
      }

      log(`[ContextTreeManager] Repairing context tree...`);

      // Remove invalid files
      for (const invalidFile of validationResult.invalidFiles) {
        try {
          // This would require careful implementation to avoid data loss
          log(`[ContextTreeManager] Would remove invalid file: ${invalidFile}`);
          // For safety, we just log what we would do
        } catch (error) {
          log(`[ContextTreeManager] Failed to remove invalid file ${invalidFile}: ${error}`);
        }
      }

      // Re-initialize to create missing directories
      const initResult = await this.initializeContextTree();
      
      log(`[ContextTreeManager] Context tree repair ${initResult.success ? 'completed' : 'failed'}`);
      return initResult.success;

    } catch (error) {
      log(`[ContextTreeManager] Context tree repair failed: ${error}`);
      return false;
    }
  }

  /**
   * Get context root path
   */
  getContextRoot(): string {
    return this.contextRoot;
  }

  /**
   * Get full path for a category/subcategory
   */
  getCategoryPath(category: ContextCategory, subcategory?: string): string {
    const categoryPath = join(this.contextRoot, category);
    return subcategory ? join(categoryPath, subcategory) : categoryPath;
  }

  /**
   * List all files in a category/subcategory
   */
  listContextFiles(category: ContextCategory, subcategory?: string): string[] {
    try {
      const path = this.getCategoryPath(category, subcategory);
      
      if (!existsSync(path)) {
        return [];
      }

      return readdirSync(path)
        .filter(file => file.endsWith('.md') && file !== 'README.md')
        .map(file => join(path, file));

    } catch (error) {
      log(`[ContextTreeManager] Failed to list context files in ${category}/${subcategory || ''}: ${error}`);
      return [];
    }
  }

  /**
   * Get statistics about the context tree
   */
  getContextTreeStats(): {
    categories: number;
    subcategories: number;
    totalFiles: number;
    filesByCategory: Record<string, number>;
  } {
    const stats = {
      categories: 0,
      subcategories: 0,
      totalFiles: 0,
      filesByCategory: {} as Record<string, number>
    };

    try {
      for (const [category, subcategories] of Object.entries(CONTEXT_TREE_STRUCTURE)) {
        const categoryPath = join(this.contextRoot, category);
        
        if (existsSync(categoryPath)) {
          stats.categories++;
          stats.filesByCategory[category] = 0;

          for (const subcategory of subcategories) {
            const subcategoryPath = join(categoryPath, subcategory);
            
            if (existsSync(subcategoryPath)) {
              stats.subcategories++;
              
              const files = readdirSync(subcategoryPath)
                .filter(file => file.endsWith('.md') && file !== 'README.md');
              
              stats.filesByCategory[category] += files.length;
              stats.totalFiles += files.length;
            }
          }
        }
      }
    } catch (error) {
      log(`[ContextTreeManager] Failed to get context tree stats: ${error}`);
    }

    return stats;
  }

  /**
   * Generate README content for subcategory
   */
  private generateSubcategoryReadme(category: string, subcategory: string): string {
    return `# ${category} / ${subcategory}

This directory contains context files for **${subcategory}** within the **${category}** category.

## Purpose

Context files in this directory help the AI assistant understand and provide better assistance for topics related to ${subcategory.replace(/_/g, ' ')}.

## File Format

Each context file should be a Markdown file with:
- Clear, actionable content
- Relevant examples where applicable
- Source information and timestamps
- Confidence ratings when available

## Auto-Generated Content

Files in this directory are automatically generated by the Groq Smart Context system based on:
- User prompts and requirements
- AI reasoning and decision-making processes
- Project-specific patterns and solutions

---
*Generated by Codex Smart Context System*
`;
  }

  /**
   * Generate README content for context root
   */
  private generateRootReadme(): string {
    const categoryCount = Object.keys(CONTEXT_TREE_STRUCTURE).length;
    const subcategoryCount = Object.values(CONTEXT_TREE_STRUCTURE).reduce((sum, arr) => sum + arr.length, 0);

    return `# Codex Smart Context System

This directory contains the hierarchical context tree for intelligent AI assistance. The context system learns from your interactions and provides increasingly relevant and accurate help over time.

## Structure

The context tree is organized into **${categoryCount} main categories** and **${subcategoryCount} subcategories**:

${Object.entries(CONTEXT_TREE_STRUCTURE).map(([category, subcategories]) => 
  `### ${category}\n${subcategories.map(sub => `- \`${sub}\``).join('\n')}`
).join('\n\n')}

## How It Works

1. **Context Storage**: Information from user prompts and AI reasoning is automatically analyzed and stored in appropriate categories
2. **Context Retrieval**: When you ask questions, relevant context is automatically retrieved and provided to enhance AI responses
3. **Continuous Learning**: The system learns from each interaction to provide better assistance over time

## AI Integration

This context system is powered by:
- **Groq Llama 3.1 8B** for fast context analysis and categorization
- **Hierarchical storage** for organized knowledge management
- **Intelligent retrieval** for relevant context injection

## Privacy & Data

- All context data is stored locally in your project
- No data is sent to external services except for AI analysis
- You have full control over what information is stored

---
*Generated by Codex Smart Context System*
*Powered by Groq Llama 3.1 8B*
`;
  }
}

/**
 * Global context tree manager instance
 */
let contextTreeManager: ContextTreeManager | null = null;

/**
 * Get or create context tree manager instance
 */
export function getContextTreeManager(projectRoot?: string): ContextTreeManager {
  if (!contextTreeManager || (projectRoot && contextTreeManager.getContextRoot() !== projectRoot)) {
    contextTreeManager = new ContextTreeManager(projectRoot);
  }
  return contextTreeManager;
}

/**
 * Initialize context tree for current project
 */
export async function initializeContextTree(projectRoot?: string): Promise<ContextTreeInitResult> {
  const manager = getContextTreeManager(projectRoot);
  return await manager.initializeContextTree();
}

/**
 * Validate context tree for current project
 */
export async function validateContextTree(projectRoot?: string): Promise<ContextTreeValidation> {
  const manager = getContextTreeManager(projectRoot);
  return await manager.validateContextTree();
}

/**
 * Ensure context tree is properly set up (validate and repair if needed)
 */
export async function ensureContextTree(projectRoot?: string): Promise<boolean> {
  try {
    const manager = getContextTreeManager(projectRoot);
    const validation = await manager.validateContextTree();
    
    if (validation.isValid) {
      return true;
    }
    
    log(`[ContextTreeManager] Context tree validation failed, attempting repair...`);
    return await manager.repairContextTree(validation);
    
  } catch (error) {
    log(`[ContextTreeManager] Failed to ensure context tree: ${error}`);
    return false;
  }
}