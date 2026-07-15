import 'dotenv/config';
import * as readline from 'readline';
import { createAgent } from './agent.mjs';
import { HumanMessage } from '@langchain/core/messages';

async function main() {
  console.log('================================================');
  console.log('  Welcome to the Office Cafe Assistant!');
  console.log('  I can help you browse the menu, find dietary');
  console.log('  options, place orders, and more.');
  console.log("  Type 'exit' to quit.");
  console.log('================================================\n');

  const agent = createAgent();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = () => {
    rl.question('You: ', async (input) => {
      const trimmed = input.trim();
      if (!trimmed || trimmed.toLowerCase() === 'exit') {
        console.log('\nGoodbye! Enjoy your meal!');
        rl.close();
        return;
      }

      try {
        const result = await agent.invoke({
          messages: [new HumanMessage(trimmed)],
        });

        // Extract the last AI message from the result
        const messages = result.messages;
        const lastMessage = messages[messages.length - 1];
        console.log(`\nAssistant: ${lastMessage.content}\n`);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(`\nError: ${errorMessage}\n`);
      }

      askQuestion();
    });
  };

  askQuestion();
}

main().catch(console.error);
