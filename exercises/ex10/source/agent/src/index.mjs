import "dotenv/config";
import * as readline from "readline";
import { cafeOrchestrator } from "./orchestrator.mjs";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("Cafe Multi-Agent Assistant");
console.log("=========================");
console.log("Three agents work together to serve you:");
console.log("  - Cafe Assistant (orders, menu, recommendations)");
console.log("  - Kitchen Manager (stock, restocking, alternatives)");
console.log("  - Grievance Manager (complaints, feedback, resolutions)");
console.log("");
console.log('Try: "I\'ll have a Fresh Orange Juice" (out of stock!)');
console.log('Try: "The pasta was cold and took 30 minutes" (complaint!)');
console.log('Type "exit" to quit.\n');

function prompt() {
  rl.question("You: ", async (input) => {
    const trimmed = input.trim();
    if (!trimmed || trimmed.toLowerCase() === "exit") {
      console.log("Thanks for visiting the cafe!");
      rl.close();
      return;
    }

    try {
      const result = await cafeOrchestrator.invoke({
        userMessage: trimmed,
      });

      console.log(`\nCafe: ${result.finalResponse}\n`);
      console.log(`  [${result.iterationCount} orchestrator iterations]\n`);
    } catch (err) {
      console.error(`Error: ${err.message}\n`);
    }

    prompt();
  });
}

prompt();
