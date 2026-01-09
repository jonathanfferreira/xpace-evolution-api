import { saveFlowState, getFlowState, deleteFlowState, ensureDbInitialized } from './src/services/memory';

async function test() {
    console.log('--- Testing PostgreSQL Flow State ---');
    await ensureDbInitialized(); // Ensure tables exist
    const userId = 'test_user_123';

    // 1. Clean start
    console.log('1. Cleaning previous state...');
    await deleteFlowState(userId);

    // 2. Initial State saving
    console.log('2. Saving Initial State (MENU_MAIN)...');
    await saveFlowState(userId, 'MENU_MAIN', { timestamp: Date.now() });

    // 3. Verify Initial State
    const state1 = await getFlowState(userId);
    console.log('   Retrieved:', state1);
    if (state1?.step !== 'MENU_MAIN') throw new Error('Failed to save/retrieve MENU_MAIN');

    // 4. Update State (Transition)
    console.log('3. Updating State (ASK_NAME)...');
    await saveFlowState(userId, 'ASK_NAME', { previous: 'MENU_MAIN' });

    // 5. Verify Updated State
    const state2 = await getFlowState(userId);
    console.log('   Retrieved:', state2);
    if (state2?.step !== 'ASK_NAME') throw new Error('Failed to update to ASK_NAME');

    // 6. Cleanup
    console.log('4. Deleting State...');
    await deleteFlowState(userId);
    const state3 = await getFlowState(userId);
    if (state3 !== null) throw new Error('Failed to delete state');

    console.log('✅ ALL TESTS PASSED');
    process.exit(0);
}

test().catch(err => {
    console.error('❌ TEST FAILED:', err);
    process.exit(1);
});
