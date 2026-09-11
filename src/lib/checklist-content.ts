// Industry-standard restaurant checklists used to seed the demo and as the
// starting templates a new outlet is created with. Owners edit these; nothing
// here is hardcoded into app behaviour.
//
// Content follows common food-safety practice (FIFO labelling, cold-chain
// temperature logs, cleaning schedules, closing security). Temperature bounds
// use Celsius. An owner in another jurisdiction will adjust these — that is
// expected, which is exactly why they are data.

export type SeedProof = 'none' | 'photo' | 'number' | 'text';

export interface SeedItem {
  title: string;
  description?: string;
  proof: SeedProof;
  proofRequired?: boolean;
  requiresApproval?: boolean;
  dueOffsetMinutes: number;
  min?: number;
  max?: number;
  unit?: string;
}

export interface SeedTemplate {
  role: string;
  shift: string;
  title: string;
  items: SeedItem[];
}

export const SEED_TEMPLATES: SeedTemplate[] = [
  {
    role: 'Kitchen Staff',
    shift: 'Opening',
    title: 'Kitchen Opening',
    items: [
      {
        title: 'Walk-in fridge temperature',
        description: 'Read the display and photograph it. Report immediately if outside range.',
        proof: 'number', proofRequired: true, requiresApproval: true,
        dueOffsetMinutes: 20, min: 0, max: 5, unit: '°C',
      },
      {
        title: 'Freezer temperature',
        proof: 'number', proofRequired: true, requiresApproval: true,
        dueOffsetMinutes: 20, min: -25, max: -15, unit: '°C',
      },
      {
        title: 'Hot holding unit up to temperature',
        proof: 'number', proofRequired: true,
        dueOffsetMinutes: 45, min: 63, max: 95, unit: '°C',
      },
      {
        title: 'Check previous night was closed down properly',
        description: 'Surfaces clear, nothing left out, no standing water.',
        proof: 'photo', proofRequired: true, dueOffsetMinutes: 30,
      },
      {
        title: 'Fryer oil quality check',
        description: 'Colour, smell, foaming. Flag if it needs changing today.',
        proof: 'text', proofRequired: true, dueOffsetMinutes: 40,
      },
      {
        title: 'FIFO labels checked, expired stock removed',
        description: 'Photograph the prep fridge shelves after checking.',
        proof: 'photo', proofRequired: true, requiresApproval: true,
        dueOffsetMinutes: 60,
      },
      {
        title: 'Gas connections and burners checked',
        proof: 'none', dueOffsetMinutes: 25,
      },
      {
        title: 'Handwash station stocked (soap, sanitiser, paper)',
        proof: 'photo', proofRequired: true, dueOffsetMinutes: 30,
      },
      {
        title: 'Chopping boards and knives sanitised',
        proof: 'none', dueOffsetMinutes: 45,
      },
      {
        title: 'Prep list for the day confirmed with head chef',
        proof: 'none', dueOffsetMinutes: 60,
      },
    ],
  },
  {
    role: 'Kitchen Staff',
    shift: 'Closing',
    title: 'Kitchen Closing',
    items: [
      {
        title: 'All gas taps and equipment switched off',
        description: 'Photograph the main gas isolation valve in the off position.',
        proof: 'photo', proofRequired: true, requiresApproval: true,
        dueOffsetMinutes: 150,
      },
      {
        title: 'Fryer filtered and covered',
        proof: 'photo', proofRequired: true, dueOffsetMinutes: 120,
      },
      {
        title: 'Closing fridge and freezer temperatures',
        proof: 'number', proofRequired: true,
        dueOffsetMinutes: 140, min: 0, max: 5, unit: '°C',
      },
      {
        title: 'All food covered, labelled and dated',
        proof: 'photo', proofRequired: true, requiresApproval: true,
        dueOffsetMinutes: 130,
      },
      {
        title: 'Floors swept and mopped',
        proof: 'photo', proofRequired: true, dueOffsetMinutes: 160,
      },
      {
        title: 'Bins emptied and waste taken to the store',
        proof: 'none', dueOffsetMinutes: 155,
      },
      {
        title: 'Extraction filters cleaned',
        proof: 'photo', dueOffsetMinutes: 150,
      },
      {
        title: 'Food waste log completed (kg)',
        proof: 'number', proofRequired: true,
        dueOffsetMinutes: 145, min: 0, max: 100, unit: 'kg',
      },
    ],
  },
  {
    role: 'Service Staff',
    shift: 'Opening',
    title: 'Front of House Opening',
    items: [
      { title: 'Dining area swept, tables wiped and set', proof: 'photo', proofRequired: true, dueOffsetMinutes: 30 },
      { title: 'Washrooms cleaned and stocked', description: 'Both washrooms. Photograph after cleaning.', proof: 'photo', proofRequired: true, dueOffsetMinutes: 40 },
      { title: 'Menus wiped and checked for damage', proof: 'none', dueOffsetMinutes: 35 },
      { title: 'Cutlery and glassware polished', proof: 'none', dueOffsetMinutes: 45 },
      { title: 'Entrance and signage clean, lights working', proof: 'photo', dueOffsetMinutes: 30 },
      { title: 'POS terminal and card machine tested', proof: 'none', dueOffsetMinutes: 20 },
      { title: 'Opening cash float counted', proof: 'number', proofRequired: true, requiresApproval: true, dueOffsetMinutes: 15, min: 0, max: 100000, unit: '₹' },
      { title: "Today's specials and out-of-stock items briefed", proof: 'text', dueOffsetMinutes: 50 },
    ],
  },
  {
    role: 'Service Staff',
    shift: 'Mid',
    title: 'Mid-Shift Checks',
    items: [
      { title: 'Washrooms re-checked and restocked', proof: 'photo', proofRequired: true, dueOffsetMinutes: 60 },
      { title: 'Dining area tidied, tables reset', proof: 'none', dueOffsetMinutes: 90 },
      { title: 'Hot holding temperature re-check', proof: 'number', proofRequired: true, dueOffsetMinutes: 120, min: 63, max: 95, unit: '°C' },
      { title: 'Bins in dining area emptied', proof: 'none', dueOffsetMinutes: 100 },
      { title: 'Stock levels of drinks checked', proof: 'none', dueOffsetMinutes: 110 },
    ],
  },
  {
    role: 'Service Staff',
    shift: 'Closing',
    title: 'Front of House Closing',
    items: [
      { title: 'Cash counted and reconciled against POS', proof: 'number', proofRequired: true, requiresApproval: true, dueOffsetMinutes: 150, min: 0, max: 1000000, unit: '₹' },
      { title: 'Card machine settled and receipt filed', proof: 'photo', proofRequired: true, requiresApproval: true, dueOffsetMinutes: 150 },
      { title: 'Tables cleared, dining floor mopped', proof: 'photo', proofRequired: true, dueOffsetMinutes: 160 },
      { title: 'Washrooms final clean', proof: 'photo', proofRequired: true, dueOffsetMinutes: 155 },
      { title: 'All doors and windows locked, shutters down', proof: 'photo', proofRequired: true, requiresApproval: true, dueOffsetMinutes: 170 },
      { title: 'Lights and air conditioning switched off', proof: 'none', dueOffsetMinutes: 170 },
      { title: 'Alarm set', proof: 'none', requiresApproval: true, dueOffsetMinutes: 175 },
    ],
  },
  {
    role: 'Bar Staff',
    shift: 'Opening',
    title: 'Bar Opening',
    items: [
      { title: 'Bar fridge temperature', proof: 'number', proofRequired: true, dueOffsetMinutes: 20, min: 0, max: 5, unit: '°C' },
      { title: 'Ice machine cleaned and stocked', proof: 'photo', proofRequired: true, dueOffsetMinutes: 35 },
      { title: 'Beer lines checked, no leaks', proof: 'none', dueOffsetMinutes: 40 },
      { title: 'Garnishes prepped and covered', proof: 'photo', dueOffsetMinutes: 50 },
      { title: 'Glassware stocked and polished', proof: 'none', dueOffsetMinutes: 45 },
      { title: 'Spirits stock count against opening sheet', proof: 'text', proofRequired: true, requiresApproval: true, dueOffsetMinutes: 30 },
    ],
  },
  {
    role: 'Bar Staff',
    shift: 'Closing',
    title: 'Bar Closing',
    items: [
      { title: 'Spirits stock count and variance recorded', proof: 'text', proofRequired: true, requiresApproval: true, dueOffsetMinutes: 150 },
      { title: 'Beer lines flushed', proof: 'none', dueOffsetMinutes: 145 },
      { title: 'Bar surfaces and sinks cleaned', proof: 'photo', proofRequired: true, dueOffsetMinutes: 160 },
      { title: 'Bar fridge restocked for tomorrow', proof: 'photo', dueOffsetMinutes: 155 },
      { title: 'Bottles secured and bar locked', proof: 'photo', proofRequired: true, requiresApproval: true, dueOffsetMinutes: 165 },
    ],
  },
  {
    role: 'Shift Manager',
    shift: 'Closing',
    title: 'Manager Closing Sign-off',
    items: [
      { title: 'Kitchen and bar closing checklists reviewed', proof: 'none', dueOffsetMinutes: 175 },
      { title: 'Any incidents or complaints logged', proof: 'text', dueOffsetMinutes: 170 },
      { title: 'Cash deposit prepared and secured', proof: 'photo', proofRequired: true, requiresApproval: true, dueOffsetMinutes: 175 },
      { title: 'Tomorrow’s staffing confirmed', proof: 'none', dueOffsetMinutes: 165 },
      { title: 'Final walkthrough completed', proof: 'photo', proofRequired: true, dueOffsetMinutes: 180 },
    ],
  },
];

// Roles, in hierarchy order. `level` drives escalation: a frozen item first
// reaches level 2 (Shift Manager), then climbs.
export const SEED_ROLES = [
  { name: 'Kitchen Staff',   level: 1, canReview: false, canUnlock: false, canManage: false },
  { name: 'Service Staff',   level: 1, canReview: false, canUnlock: false, canManage: false },
  { name: 'Bar Staff',       level: 1, canReview: false, canUnlock: false, canManage: false },
  { name: 'Shift Manager',   level: 2, canReview: true,  canUnlock: true,  canManage: false },
  { name: 'General Manager', level: 3, canReview: true,  canUnlock: true,  canManage: true  },
  { name: 'Owner',           level: 4, canReview: true,  canUnlock: true,  canManage: true  },
];

export const SEED_SHIFTS = [
  { name: 'Opening', start: '07:00', end: '12:00', sort: 0 },
  { name: 'Mid',     start: '12:00', end: '18:00', sort: 1 },
  { name: 'Closing', start: '18:00', end: '23:30', sort: 2 },
];
