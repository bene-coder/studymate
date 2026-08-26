/**
 * RESPONSE STRATEGY
 * Maps detected emotional states to pedagogical interventions.
 * 
 * Based on Table 1 (Student Emotional States and AI Response Strategies)
 * from the seminar report, grounded in D'Mello & Graesser (2012) AutoTutor
 * and Pekrun's Control-Value Theory.
 */

const RESPONSE_STRATEGIES = {

  frustrated: {
    tone: 'validating',
    interventions: [
      "I can see this is challenging — that's completely normal at this stage.",
      "Let's slow down and break this into smaller pieces.",
      "You're not expected to get this immediately. Let's tackle one part at a time.",
      "This concept trips up a lot of students. Here's a simpler way to think about it:",
    ],
    scaffoldingLevel: 'high',
    pacing: 'slow',
  },

  confused: {
    tone: 'clarifying',
    interventions: [
      "Let me explain that differently.",
      "Here's a concrete example that might make this clearer:",
      "Good question to be wrestling with — this is where the concept gets interesting.",
      "Let's trace through this step by step together.",
    ],
    scaffoldingLevel: 'medium',
    pacing: 'moderate',
  },

  bored: {
    tone: 'activating',
    interventions: [
      "Let's make this more interesting — here's a real-world application:",
      "Try this challenge: can you apply this concept to solve the following?",
      "You seem to have the basics. Let's go deeper.",
      "Here's a harder version of this problem — see if you can work it out:",
    ],
    scaffoldingLevel: 'low',
    pacing: 'fast',
  },

  engaged: {
    tone: 'reinforcing',
    interventions: [
      "You're on the right track — let's keep building on this.",
      "Excellent thinking. Now let's extend this further:",
      "That's correct. Here's the next layer of this concept:",
      "Great engagement. Let's explore a related idea:",
    ],
    scaffoldingLevel: 'low',
    pacing: 'normal',
  },
};

/**
 * Selects a response strategy based on the detected emotional state.
 * Rotates through interventions to avoid repeating the same opener.
 * 
 * @param {string} emotionalState - One of: frustrated | confused | bored | engaged
 * @param {number} turnIndex      - The current turn number in the session (0-based).
 *                                  Used to cycle through intervention variants.
 * @returns {{
 *   opening: string,
 *   tone: string,
 *   scaffoldingLevel: string,
 *   pacing: string,
 *   emotionalState: string
 * }}
 */
export function selectResponseStrategy(emotionalState, turnIndex = 0) {
  const strategy = RESPONSE_STRATEGIES[emotionalState] ?? RESPONSE_STRATEGIES.confused;

  // Cycle through openers so the same phrase doesn't repeat every turn
  const opening = strategy.interventions[turnIndex % strategy.interventions.length];

  return {
    opening,
    tone: strategy.tone,
    scaffoldingLevel: strategy.scaffoldingLevel,
    pacing: strategy.pacing,
    emotionalState,
  };
}