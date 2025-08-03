/**
 * WizardLM-2-8x22B Function Calling Wrapper
 * Adds function calling capabilities to models that don't natively support it
 */

import type { OpenAI } from "openai";
import type { Tool } from "openai/resources/responses/responses";

export interface WizardLMFunctionCall {
  name: string;
  arguments: string;
}

export class WizardLMFunctionWrapper {
  private tools: Tool[] = [];

  constructor(tools: Tool[]) {
    this.tools = tools;
  }

  /**
   * Create a system prompt that teaches WizardLM how to use functions
   */
  createSystemPrompt(): string {
    if (this.tools.length === 0) {
      return "";
    }

    const toolDescriptions = this.tools.map(tool => {
      if (tool.type === 'function') {
        const func = tool.function;
        return `Function: ${func.name}
Description: ${func.description}
Parameters: ${JSON.stringify(func.parameters, null, 2)}`;
      }
      return "";
    }).filter(Boolean).join('\n\n');

    return `You are an AI assistant with access to functions. When you need to use a function, respond with:

FUNCTION_CALL_START
{
  "function_name": "function_name_here",
  "arguments": {
    "param1": "value1",
    "param2": "value2"
  }
}
FUNCTION_CALL_END

Available functions:
${toolDescriptions}

Guidelines:
1. Use functions when appropriate to help the user
2. Only call functions that are available
3. Provide proper arguments according to the function schema
4. After calling a function, wait for the result before proceeding
5. If no function is needed, respond normally without FUNCTION_CALL markers

Example:
User: "List the files in the current directory"
Assistant: I'll list the files in the current directory for you.

FUNCTION_CALL_START
{
  "function_name": "bash",
  "arguments": {
    "command": "ls -la"
  }
}
FUNCTION_CALL_END`;
  }

  /**
   * Parse WizardLM response to extract function calls
   */
  parseFunctionCalls(response: string): { 
    functionCalls: WizardLMFunctionCall[], 
    textContent: string 
  } {
    const functionCalls: WizardLMFunctionCall[] = [];
    let textContent = response;

    // Extract function calls
    const functionCallRegex = /FUNCTION_CALL_START\s*([\s\S]*?)\s*FUNCTION_CALL_END/g;
    let match;

    while ((match = functionCallRegex.exec(response)) !== null) {
      try {
        const functionCallJson = match[1].trim();
        const parsed = JSON.parse(functionCallJson);
        
        if (parsed.function_name && parsed.arguments) {
          functionCalls.push({
            name: parsed.function_name,
            arguments: JSON.stringify(parsed.arguments)
          });
          
          // Remove function call from text content
          textContent = textContent.replace(match[0], '').trim();
        }
      } catch (error) {
        console.warn(`Failed to parse function call: ${match[1]}`);
      }
    }

    return { functionCalls, textContent };
  }

  /**
   * Execute a function call
   */
  async executeFunction(functionCall: WizardLMFunctionCall): Promise<string> {
    // Find the tool
    const tool = this.tools.find(t => 
      t.type === 'function' && t.function.name === functionCall.name
    );

    if (!tool || tool.type !== 'function') {
      return `Error: Function ${functionCall.name} not found`;
    }

    try {
      const args = JSON.parse(functionCall.arguments);
      
      // For shell/bash function
      if (functionCall.name === 'bash' && args.command) {
        const { spawn } = await import('child_process');
        
        return new Promise((resolve) => {
          const child = spawn('bash', ['-c', args.command], {
            stdio: ['ignore', 'pipe', 'pipe']
          });
          
          let output = '';
          let error = '';
          
          child.stdout.on('data', (data) => {
            output += data.toString();
          });
          
          child.stderr.on('data', (data) => {
            error += data.toString();
          });
          
          child.on('close', (code) => {
            if (code === 0) {
              resolve(output.trim() || 'Command executed successfully');
            } else {
              resolve(`Error (code ${code}): ${error.trim() || 'Command failed'}`);
            }
          });
          
          // Timeout after 30 seconds
          setTimeout(() => {
            child.kill();
            resolve('Error: Command timed out after 30 seconds');
          }, 30000);
        });
      }
      
      return `Function ${functionCall.name} executed (custom execution needed)`;
    } catch (error) {
      return `Error executing ${functionCall.name}: ${error}`;
    }
  }

  /**
   * Process a complete conversation turn with function calling
   */
  async processWithFunctions(
    client: OpenAI,
    model: string,
    messages: OpenAI.Chat.Completions.ChatCompletionMessage[],
    maxIterations: number = 5
  ): Promise<{
    finalResponse: string;
    functionCallsExecuted: number;
    messages: OpenAI.Chat.Completions.ChatCompletionMessage[];
  }> {
    const conversationMessages = [...messages];
    let functionCallsExecuted = 0;
    let iterations = 0;

    // Add system prompt if tools are available
    if (this.tools.length > 0) {
      conversationMessages.unshift({
        role: 'system',
        content: this.createSystemPrompt()
      });
    }

    while (iterations < maxIterations) {
      iterations++;

      // Get AI response
      const response = await client.chat.completions.create({
        model,
        messages: conversationMessages,
        temperature: 0.3,
        max_tokens: 2000
      });

      const aiResponse = response.choices[0]?.message?.content || '';
      
      // Parse for function calls
      const { functionCalls, textContent } = this.parseFunctionCalls(aiResponse);

      // Add AI message to conversation
      conversationMessages.push({
        role: 'assistant',
        content: textContent || aiResponse
      });

      // If no function calls, we're done
      if (functionCalls.length === 0) {
        return {
          finalResponse: textContent || aiResponse,
          functionCallsExecuted,
          messages: conversationMessages
        };
      }

      // Execute function calls
      for (const functionCall of functionCalls) {
        console.log(`🔧 [WizardLM] Executing function: ${functionCall.name}`);
        
        const result = await this.executeFunction(functionCall);
        functionCallsExecuted++;

        // Add function result to conversation
        conversationMessages.push({
          role: 'user',
          content: `Function ${functionCall.name} result: ${result}`
        });
      }
    }

    return {
      finalResponse: 'Max iterations reached',
      functionCallsExecuted,
      messages: conversationMessages
    };
  }
}

export { WizardLMFunctionWrapper };