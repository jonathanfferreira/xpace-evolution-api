
import { generateResponse } from './src/services/ai';
import { config } from './src/config';
import { saveMessage, clearHistory } from './src/services/memory';
import { handleWebhook } from './src/controllers/webhookController'; // We might need to go through controller to hit flow?
// No, generateResponse is just AI. We need to hit the CONTROLLER loop to test the flow state logic (handleMenuSelection etc).
// The previous simulation only tested generateResponse (AI), which BYPASSED the controller logic.
// THAT IS WHY THE SIMULATION PASSED BUT THE BOT FAILED.

// To truly simulate the controller flow, we need to mock the Request/Response and call handleWebhook.
// Or, simpler: Call the handlers directly.

import { handleMenuSelection, handleQuizResponse, sendMainMenu } from './src/services/flowService';
import { getFlowState, saveFlowState } from './src/services/memory';

async function runFlowSimulation() {
    console.log("🎭 STARTING FLOW SIMULATION (CONTROLLER LOGIC)...");

    // Mock user
    const from = "sim-freeze-check";
    const pushName = "SimulationUser";

    // 1. Start clean
    await clearHistory(from);
    console.log("\n--- STEP 1: Sending 'menu' ---");
    // Simulate what happens in controller when 'menu' is received
    // Controller calls sendMainMenu
    await sendMainMenu(from, pushName);
    console.log("Bot: [Sent Main Menu]");

    // 2. User sends "1"
    console.log("\n--- STEP 2: User sends '1' (Quero Dançar) ---");
    let currentState = await getFlowState(from); // Should be MENU_MAIN
    console.log("Current State:", currentState?.step);

    // Controller logic:
    const input = "1";
    const handledMenu = await handleMenuSelection(input, from, pushName, currentState);
    console.log("Handled by Menu?", handledMenu); // Should be true

    // 3. User sends "Jhonney" (THE FREEZE POINT)
    console.log("\n--- STEP 3: User sends 'Jhonney' ---");
    currentState = await getFlowState(from); // Should be ASK_NAME
    console.log("Current State:", currentState?.step);
    const msgBody = "Jhonney";

    // Controller logic loop:
    // It would try handleMenuSelection -> False
    // Then handleQuizResponse -> Should satisfy ASK_NAME
    const handledQuiz = await handleQuizResponse(msgBody, from, currentState);
    console.log("Handled by Quiz?", handledQuiz);

    if (handledQuiz) {
        console.log("✅ SUCCESS! Quiz handler caught the name.");
    } else {
        console.error("❌ FAILURE! Name was not handled. Bot would freeze.");
    }

    // 4. User sends "25"
    console.log("\n--- STEP 4: User sends '25' ---");
    currentState = await getFlowState(from); // Should be ASK_AGE
    console.log("Current State:", currentState?.step);
    const ageMsg = "25";
    const handledAge = await handleQuizResponse(ageMsg, from, currentState);
    console.log("Handled Age?", handledAge);
}

runFlowSimulation();
