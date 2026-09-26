// The meeting the live e2e "speaks" into the microphone, and the facts it must get back.
export const VOICE = { Maya: 'Microsoft Zira Desktop', Jordan: 'Microsoft David Desktop' } as const;

export const LINES: { speaker: keyof typeof VOICE; text: string }[] = [
  { speaker: 'Maya', text: "Okay, let's start the pricing review. We decided to launch the new Team plan at twelve dollars per seat." },
  { speaker: 'Jordan', text: 'Sounds good. Priya will send the updated pricing page draft by Friday.' },
  { speaker: 'Maya', text: 'And Jordan will email the three beta customers about the change on Monday.' },
  { speaker: 'Jordan', text: 'One risk is the billing migration, so we will run it on Sunday night.' },
  { speaker: 'Maya', text: "Great, that's everything for today. Thanks everyone." },
];
