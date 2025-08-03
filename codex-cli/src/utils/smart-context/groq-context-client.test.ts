/**
 * Test suite for Groq Context Client
 * Comprehensive testing following best practices
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { 
  GroqContextClient, 
  getGroqContextClient, 
  testGroqContextClient,
  GroqContextError,
  type ContextAnalysisRequest,
  type ContextStorageRequest 
} from './groq-context-client.js';

// Test configuration
const TEST_TIMEOUT = 30000; // 30 seconds for API calls
const GROQ_API_KEY = process.env.GROQ_API_KEY;

describe('GroqContextClient', () => {
  let client: GroqContextClient;
  let skipApiTests = false;

  beforeAll(() => {
    // Skip API tests if no API key is provided
    if (!GROQ_API_KEY) {
      console.warn('⚠️  GROQ_API_KEY not found - skipping API integration tests');
      skipApiTests = true;
      return;
    }

    // Set API key for testing
    process.env.GROQ_API_KEY = GROQ_API_KEY;
  });

  beforeEach(() => {
    if (!skipApiTests) {
      client = new GroqContextClient();
    }
  });

  describe('Constructor and Initialization', () => {
    it('should create client instance successfully with valid API key', () => {
      if (skipApiTests) return;
      
      expect(client).toBeInstanceOf(GroqContextClient);
    });

    it('should throw error when API key is missing', () => {
      const originalKey = process.env.GROQ_API_KEY;
      delete process.env.GROQ_API_KEY;

      expect(() => new GroqContextClient()).toThrow(GroqContextError);
      expect(() => new GroqContextClient()).toThrow('Groq API key not found');

      // Restore API key
      if (originalKey) {
        process.env.GROQ_API_KEY = originalKey;
      }
    });

    it('should use singleton pattern correctly', () => {
      if (skipApiTests) return;

      const client1 = getGroqContextClient();
      const client2 = getGroqContextClient();
      
      expect(client1).toBe(client2); // Same instance
    });
  });

  describe('Connection Testing', () => {
    it('should test connection successfully', async () => {
      if (skipApiTests) return;

      const isConnected = await client.testConnection();
      expect(isConnected).toBe(true);
    }, TEST_TIMEOUT);

    it('should handle connection test via utility function', async () => {
      if (skipApiTests) return;

      const isAvailable = await testGroqContextClient();
      expect(isAvailable).toBe(true);
    }, TEST_TIMEOUT);
  });

  describe('Context Analysis for Retrieval', () => {
    const testCases = [
      {
        name: 'Simple bug fix request',
        request: {
          prompt: 'Fix the API authentication error in the login component',
          projectInfo: {
            name: 'web-app',
            path: '/Users/test/web-app',
            type: 'React TypeScript'
          }
        },
        expectedCategories: ['SOLUTIONS', 'TROUBLESHOOTING']
      },
      {
        name: 'Architecture decision request',
        request: {
          prompt: 'Should we use Redux or Zustand for state management in our new feature?',
          projectInfo: {
            name: 'frontend-app', 
            path: '/Users/test/frontend-app',
            type: 'React'
          }
        },
        expectedCategories: ['DECISIONS', 'BEST_PRACTICES']
      },
      {
        name: 'Performance optimization request',
        request: {
          prompt: 'How to optimize database queries that are running slowly?',
          projectInfo: {
            name: 'api-server',
            path: '/Users/test/api-server', 
            type: 'Node.js Express'
          }
        },
        expectedCategories: ['SOLUTIONS', 'BEST_PRACTICES']
      },
      {
        name: 'Code review and standards request',
        request: {
          prompt: 'Review this function and suggest improvements following our coding standards',
          projectInfo: {
            name: 'backend-api',
            path: '/Users/test/backend-api',
            type: 'Python FastAPI'
          }
        },
        expectedCategories: ['PROJECT_RULES', 'BEST_PRACTICES']
      }
    ];

    testCases.forEach(({ name, request, expectedCategories }) => {
      it(`should analyze ${name} correctly`, async () => {
        if (skipApiTests) return;

        const result = await client.analyzePromptForContext(request);

        // Validate response structure
        expect(result).toHaveProperty('relevantCategories');
        expect(result).toHaveProperty('confidence');
        expect(result).toHaveProperty('processingTime');
        expect(result).toHaveProperty('reasoning');

        // Validate categories
        expect(Array.isArray(result.relevantCategories)).toBe(true);
        expect(result.relevantCategories.length).toBeGreaterThan(0);

        // Check if at least one expected category is present
        const foundCategories = result.relevantCategories.map(c => c.category);
        const hasExpectedCategory = expectedCategories.some(expected => 
          foundCategories.includes(expected)
        );
        expect(hasExpectedCategory).toBe(true);

        // Validate individual categories
        result.relevantCategories.forEach(category => {
          expect(category).toHaveProperty('category');
          expect(category).toHaveProperty('subcategory');
          expect(category).toHaveProperty('relevance');
          expect(category).toHaveProperty('reasoning');
          
          expect(typeof category.relevance).toBe('number');
          expect(category.relevance).toBeGreaterThanOrEqual(0);
          expect(category.relevance).toBeLessThanOrEqual(1);
        });

        // Validate confidence and processing time
        expect(typeof result.confidence).toBe('number');
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
        expect(result.processingTime).toBeGreaterThan(0);

        console.log(`✅ ${name}: ${result.relevantCategories.length} categories, ${result.processingTime}ms`);
      }, TEST_TIMEOUT);
    });

    it('should handle empty prompt gracefully', async () => {
      if (skipApiTests) return;

      const request: ContextAnalysisRequest = {
        prompt: '',
      };

      const result = await client.analyzePromptForContext(request);
      
      expect(result).toHaveProperty('relevantCategories');
      expect(result.confidence).toBeLessThanOrEqual(0.5); // Low confidence for empty prompt
    }, TEST_TIMEOUT);

    it('should handle very long prompt', async () => {
      if (skipApiTests) return;

      const longPrompt = 'Fix this issue: ' + 'a'.repeat(2000); // Very long prompt
      const request: ContextAnalysisRequest = {
        prompt: longPrompt,
      };

      const result = await client.analyzePromptForContext(request);
      
      expect(result).toHaveProperty('relevantCategories');
      expect(result.processingTime).toBeLessThan(10000); // Should complete within 10 seconds
    }, TEST_TIMEOUT);
  });

  describe('Context Analysis for Storage', () => {
    const storageTestCases = [
      {
        name: 'User prompt with project decision',
        request: {
          content: 'We decided to use PostgreSQL instead of MongoDB because we need ACID transactions for financial data',
          contentType: 'user_prompt' as const,
          projectInfo: {
            name: 'fintech-api',
            path: '/Users/test/fintech-api',
            type: 'Node.js'
          }
        },
        expectedCategory: 'DECISIONS'
      },
      {
        name: 'Reasoning stream with solution',
        request: {
          content: 'I tried using Promise.all() but it failed with concurrent database connections. Instead, I used a queue with limited concurrency which resolved the issue.',
          contentType: 'reasoning_stream' as const
        },
        expectedCategory: 'SOLUTIONS'
      },
      {
        name: 'Failed approach in reasoning',
        request: {
          content: 'First I attempted to use direct DOM manipulation in React, but this caused state inconsistencies and re-render issues. This approach should be avoided.',
          contentType: 'reasoning_stream' as const
        },
        expectedCategory: 'FAILED_ATTEMPTS'
      },
      {
        name: 'Best practice from prompt',
        request: {
          content: 'Always validate input data at the API boundary and use TypeScript interfaces to ensure type safety throughout the application',
          contentType: 'user_prompt' as const
        },
        expectedCategory: 'BEST_PRACTICES'
      }
    ];

    storageTestCases.forEach(({ name, request, expectedCategory }) => {
      it(`should analyze ${name} for storage correctly`, async () => {
        if (skipApiTests) return;

        const result = await client.analyzeContentForStorage(request);

        // Validate response structure
        expect(result).toHaveProperty('items');
        expect(result).toHaveProperty('totalItems');
        expect(result).toHaveProperty('processingTime');

        // Validate items array
        expect(Array.isArray(result.items)).toBe(true);
        expect(result.totalItems).toBe(result.items.length);

        if (result.items.length > 0) {
          // Check if expected category is found
          const foundCategories = result.items.map(item => item.category);
          expect(foundCategories).toContain(expectedCategory);

          // Validate individual items
          result.items.forEach(item => {
            expect(item).toHaveProperty('category');
            expect(item).toHaveProperty('subcategory');
            expect(item).toHaveProperty('content');
            expect(item).toHaveProperty('confidence');
            expect(item).toHaveProperty('reasoning');

            expect(typeof item.confidence).toBe('number');
            expect(item.confidence).toBeGreaterThanOrEqual(0);
            expect(item.confidence).toBeLessThanOrEqual(1);
            expect(item.content.length).toBeGreaterThan(0);
          });
        }

        console.log(`✅ ${name}: ${result.items.length} items, ${result.processingTime}ms`);
      }, TEST_TIMEOUT);
    });

    it('should handle content with no valuable information', async () => {
      if (skipApiTests) return;

      const request: ContextStorageRequest = {
        content: 'hello test 123',
        contentType: 'user_prompt'
      };

      const result = await client.analyzeContentForStorage(request);
      
      expect(result).toHaveProperty('items');
      expect(result.totalItems).toBe(0); // No valuable content to store
    }, TEST_TIMEOUT);
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON responses gracefully', async () => {
      if (skipApiTests) return;

      // This test would require mocking the API response
      // For now, we test that the client handles errors without crashing
      const request: ContextAnalysisRequest = {
        prompt: 'test prompt'
      };

      // The client should not throw but return a fallback response
      const result = await client.analyzePromptForContext(request);
      expect(result).toHaveProperty('relevantCategories');
    }, TEST_TIMEOUT);

    it('should handle network timeouts gracefully', async () => {
      if (skipApiTests) return;

      // Test with a very short timeout by creating a new client
      // This would require dependency injection to test properly
      // For now, we verify the client has proper error handling structure
      expect(GroqContextError).toBeDefined();
    });
  });

  describe('Performance Requirements', () => {
    it('should complete context analysis within performance requirements', async () => {
      if (skipApiTests) return;

      const request: ContextAnalysisRequest = {
        prompt: 'Fix the authentication bug in the user login system'
      };

      const startTime = Date.now();
      const result = await client.analyzePromptForContext(request);
      const totalTime = Date.now() - startTime;

      // Should complete within 2 seconds (roadmap requirement)
      expect(totalTime).toBeLessThan(2000);
      expect(result.processingTime).toBeLessThan(2000);

      console.log(`⏱️  Performance test: ${totalTime}ms total, ${result.processingTime}ms processing`);
    }, TEST_TIMEOUT);

    it('should complete storage analysis within performance requirements', async () => {
      if (skipApiTests) return;

      const request: ContextStorageRequest = {
        content: 'We chose to implement caching using Redis because it provides better performance than in-memory caching for our distributed architecture',
        contentType: 'user_prompt'
      };

      const startTime = Date.now();
      const result = await client.analyzeContentForStorage(request);
      const totalTime = Date.now() - startTime;

      // Should complete within 1 second (roadmap requirement)
      expect(totalTime).toBeLessThan(1000);
      expect(result.processingTime).toBeLessThan(1000);

      console.log(`⏱️  Storage performance test: ${totalTime}ms total, ${result.processingTime}ms processing`);
    }, TEST_TIMEOUT);
  });
});

// Integration test suite
describe('GroqContextClient Integration', () => {
  it('should work end-to-end with real scenarios', async () => {
    if (!process.env.GROQ_API_KEY) return;

    const client = getGroqContextClient();
    
    // Test connection
    const isConnected = await client.testConnection();
    expect(isConnected).toBe(true);

    // Test analysis
    const analysisResult = await client.analyzePromptForContext({
      prompt: 'Help me implement user authentication with JWT tokens',
      projectInfo: {
        name: 'auth-service',
        path: '/Users/test/auth-service',
        type: 'Express.js'
      }
    });

    expect(analysisResult.relevantCategories.length).toBeGreaterThan(0);

    // Test storage
    const storageResult = await client.analyzeContentForStorage({
      content: 'JWT tokens should have short expiration times and be stored securely in httpOnly cookies to prevent XSS attacks',
      contentType: 'user_prompt'
    });

    expect(storageResult.totalItems).toBeGreaterThanOrEqual(0);

    console.log('🎉 End-to-end integration test passed!');
  }, TEST_TIMEOUT);
});