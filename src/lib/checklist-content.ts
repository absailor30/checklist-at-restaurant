// Industry-standard restaurant checklists used to seed the demo and as the
// starting templates a new outlet is created with. Owners edit these; nothing
// here is hardcoded into app behaviour.
//
// Content follows common food-safety practice (FIFO labelling, cold-chain
// temperature logs, cleaning schedules, closing security). Temperature bounds
// use Celsius. An owner in another jurisdiction will adjust these — that is
// expected, which is exactly why they are data.

export type SeedProof = 'none' | 'photo' | 'number' | 'text';
export type SeedPhotoMode = 'none' | 'optional' | 'required';

export interface SeedItem {
  title: string;
  description?: string;
  proof: SeedProof;
  proofRequired?: boolean;
  // A photo alongside the primary proof. A temperature log wants both: the
  // number to trend, and a picture of the display showing it.
  photoMode?: SeedPhotoMode;
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


// Checklists organised by department rather than by kitchen station.
//
// Modelled on a line-check audit: each item names what is being checked and the
// standard it is checked against — the temperature band, the quality the item
// must meet, its shelf life, the container it lives in. An instruction like
// "check the fridge" is not auditable; "walk-in fridge, 0–5°C, photograph the
// display" is.
//
// Departments, not stations, because a restaurant group has work that never
// touches a kitchen: banking, reviews, rotas, the POS, the pest contract. Those
// are the tasks that quietly go undone because nobody owns them.

export const SEED_TEMPLATES: SeedTemplate[] = [

  // ---------------------------------------------------------------- KITCHEN

  {
    role: 'Kitchen',
    shift: 'Opening',
    title: 'Kitchen — Opening Line Check',
    items: [
      { title: 'Walk-in fridge temperature', description: 'Read the display, photograph it. Report immediately if outside band.',
        proof: 'number', proofRequired: true, requiresApproval: true, photoMode: 'required',
        dueOffsetMinutes: 20, min: 0, max: 5, unit: '°C' },
      { title: 'Freezer temperature', description: 'Target −22 to −18°C. Ice build-up on the door seal is a fail.',
        proof: 'number', proofRequired: true, requiresApproval: true, photoMode: 'required',
        dueOffsetMinutes: 20, min: -25, max: -15, unit: '°C' },
      { title: 'Hot holding unit up to temperature', description: 'Must reach 63°C before any food goes in.',
        proof: 'number', proofRequired: true, photoMode: 'required',
        dueOffsetMinutes: 45, min: 63, max: 95, unit: '°C' },
      { title: 'Prep fridge — FIFO labels checked, expired stock pulled',
        description: 'Every container dated. Anything past its life goes in the bin, not to the back.',
        proof: 'photo', proofRequired: true, requiresApproval: true, dueOffsetMinutes: 60 },
      { title: 'Sauces and dressings — quality and life',
        description: 'Below 5°C, fresh smell, no separation, 3-day life, 1/6 pan with a labelled ladle.',
        proof: 'text', proofRequired: true, dueOffsetMinutes: 55 },
      { title: 'Fryer oil quality', description: 'Colour, smell, foaming. Flag if it needs changing today.',
        proof: 'text', proofRequired: true, dueOffsetMinutes: 40 },
      { title: 'Flat top / griddle at temperature', description: 'Target 190°C, clean and sanitised before service.',
        proof: 'number', proofRequired: true, dueOffsetMinutes: 45, min: 180, max: 200, unit: '°C' },
      { title: 'Chopping boards and knives sanitised', description: 'Colour-coded boards in the right slots, no cracks.',
        proof: 'none', dueOffsetMinutes: 45 },
      { title: 'Handwash station stocked', description: 'Soap, sanitiser, paper towels, hot water running.',
        proof: 'photo', proofRequired: true, dueOffsetMinutes: 30 },
      { title: 'Gas connections and burners checked', proof: 'none', dueOffsetMinutes: 25 },
      { title: 'Prep list for the day agreed with head chef', proof: 'none', dueOffsetMinutes: 60 },
    ],
  },
  {
    role: 'Kitchen',
    shift: 'Mid',
    title: 'Kitchen — Mid-Shift Line Check',
    items: [
      { title: 'Hot holding temperature re-check', proof: 'number', proofRequired: true,
        photoMode: 'required', dueOffsetMinutes: 120, min: 63, max: 95, unit: '°C' },
      { title: 'Cold line temperature re-check', proof: 'number', proofRequired: true,
        photoMode: 'required', dueOffsetMinutes: 120, min: 0, max: 5, unit: '°C' },
      { title: 'Back-up prep topped up', description: 'No station running on its last portion.',
        proof: 'none', dueOffsetMinutes: 130 },
      { title: 'Fryer oil filtered', proof: 'none', dueOffsetMinutes: 150 },
      { title: 'Bins emptied, floor clear of spills', proof: 'none', dueOffsetMinutes: 140 },
    ],
  },
  {
    role: 'Kitchen',
    shift: 'Closing',
    title: 'Kitchen — Closing',
    items: [
      { title: 'All gas taps and equipment off', description: 'Photograph the main isolation valve in the off position.',
        proof: 'photo', proofRequired: true, requiresApproval: true, dueOffsetMinutes: 150 },
      { title: 'Closing fridge and freezer temperatures', proof: 'number', proofRequired: true,
        photoMode: 'required', dueOffsetMinutes: 140, min: 0, max: 5, unit: '°C' },
      { title: 'All food covered, labelled and dated', proof: 'photo', proofRequired: true,
        requiresApproval: true, dueOffsetMinutes: 130 },
      { title: 'Fryer filtered and covered', proof: 'photo', proofRequired: true, dueOffsetMinutes: 120 },
      { title: 'Extraction filters cleaned', proof: 'photo', dueOffsetMinutes: 150 },
      { title: 'Food waste recorded', proof: 'number', proofRequired: true, photoMode: 'optional',
        dueOffsetMinutes: 145, min: 0, max: 100, unit: 'kg' },
      { title: 'Floors swept and mopped, drains clear', proof: 'photo', proofRequired: true, dueOffsetMinutes: 160 },
    ],
  },

  // ----------------------------------------------------------- FRONT OFFICE

  {
    role: 'Front Office',
    shift: 'Opening',
    title: 'Front Office — Opening',
    items: [
      { title: 'Reservations for today reviewed', description: 'Covers, timings, large parties, special requests.',
        proof: 'text', proofRequired: true, dueOffsetMinutes: 20 },
      { title: 'Table plan set for the day', proof: 'photo', dueOffsetMinutes: 30 },
      { title: 'POS terminal and card machine tested', description: 'One test transaction, then void it.',
        proof: 'none', dueOffsetMinutes: 20 },
      { title: 'Opening cash float counted', proof: 'number', proofRequired: true, requiresApproval: true,
        photoMode: 'optional', dueOffsetMinutes: 15, min: 0, max: 100000, unit: '₹' },
      { title: 'Menus wiped, checked for damage and correct pricing', proof: 'none', dueOffsetMinutes: 35 },
      { title: 'Entrance, signage and lighting checked', proof: 'photo', dueOffsetMinutes: 30 },
      { title: 'Out-of-stock items and specials briefed to floor', proof: 'text', proofRequired: true, dueOffsetMinutes: 50 },
    ],
  },
  {
    role: 'Front Office',
    shift: 'Closing',
    title: 'Front Office — Closing',
    items: [
      { title: 'Cash counted and reconciled against POS', proof: 'number', proofRequired: true,
        requiresApproval: true, photoMode: 'required', dueOffsetMinutes: 150, min: 0, max: 1000000, unit: '₹' },
      { title: 'Card machine settled, receipt filed', proof: 'photo', proofRequired: true,
        requiresApproval: true, dueOffsetMinutes: 150 },
      { title: 'Tomorrow’s reservations confirmed', proof: 'none', dueOffsetMinutes: 160 },
      { title: 'No-shows and walk-outs logged', proof: 'text', dueOffsetMinutes: 155 },
      { title: 'All doors and windows locked, shutters down', proof: 'photo', proofRequired: true,
        requiresApproval: true, dueOffsetMinutes: 170 },
      { title: 'Alarm set', proof: 'none', requiresApproval: true, dueOffsetMinutes: 175 },
    ],
  },

  // ---------------------------------------------------------------- SERVICE

  {
    role: 'Service',
    shift: 'Opening',
    title: 'Service — Opening',
    items: [
      { title: 'Dining area swept, tables wiped and set', proof: 'photo', proofRequired: true, dueOffsetMinutes: 30 },
      { title: 'Cutlery and glassware polished, no chips', proof: 'none', dueOffsetMinutes: 45 },
      { title: 'Condiments filled, clean and in date', proof: 'photo', dueOffsetMinutes: 40 },
      { title: 'Service stations stocked', description: 'Napkins, straws, order pads, sanitiser.',
        proof: 'none', dueOffsetMinutes: 45 },
      { title: 'Staff grooming and uniform check', proof: 'none', requiresApproval: true, dueOffsetMinutes: 15 },
    ],
  },
  {
    role: 'Service',
    shift: 'Mid',
    title: 'Service — Mid-Shift',
    items: [
      { title: 'Dining area tidied, tables reset', proof: 'none', dueOffsetMinutes: 90 },
      { title: 'Condiments and service stations topped up', proof: 'none', dueOffsetMinutes: 100 },
      { title: 'Table turn times reviewed with the floor', proof: 'text', dueOffsetMinutes: 120 },
    ],
  },
  {
    role: 'Service',
    shift: 'Closing',
    title: 'Service — Closing',
    items: [
      { title: 'Tables cleared, dining floor mopped', proof: 'photo', proofRequired: true, dueOffsetMinutes: 160 },
      { title: 'Chairs stacked, floor clear for cleaning', proof: 'none', dueOffsetMinutes: 165 },
      { title: 'Cutlery and glassware returned and counted', proof: 'none', dueOffsetMinutes: 155 },
      { title: 'Lights and air conditioning off', proof: 'none', dueOffsetMinutes: 170 },
    ],
  },

  // ------------------------------------------------------- BAR & BEVERAGE

  {
    role: 'Bar & Beverage',
    shift: 'Opening',
    title: 'Bar — Opening',
    items: [
      { title: 'Bar fridge temperature', proof: 'number', proofRequired: true, photoMode: 'required',
        dueOffsetMinutes: 20, min: 0, max: 5, unit: '°C' },
      { title: 'Ice machine cleaned and stocked', description: 'No scale, scoop stored outside the bin.',
        proof: 'photo', proofRequired: true, dueOffsetMinutes: 35 },
      { title: 'Beer lines checked, no leaks, gas pressure correct', proof: 'none', dueOffsetMinutes: 40 },
      { title: 'Garnishes prepped, covered and dated', description: 'Below 5°C, 24-hour life, 1/6 pan.',
        proof: 'photo', dueOffsetMinutes: 50 },
      { title: 'Spirits stock count against opening sheet', proof: 'text', proofRequired: true,
        requiresApproval: true, dueOffsetMinutes: 30 },
      { title: 'Glassware stocked and polished', proof: 'none', dueOffsetMinutes: 45 },
    ],
  },
  {
    role: 'Bar & Beverage',
    shift: 'Closing',
    title: 'Bar — Closing',
    items: [
      { title: 'Spirits stock count and variance recorded', proof: 'text', proofRequired: true,
        requiresApproval: true, dueOffsetMinutes: 150 },
      { title: 'Beer lines flushed', proof: 'none', dueOffsetMinutes: 145 },
      { title: 'Bar surfaces, sinks and speed rails cleaned', proof: 'photo', proofRequired: true, dueOffsetMinutes: 160 },
      { title: 'Bar fridge restocked for tomorrow', proof: 'photo', dueOffsetMinutes: 155 },
      { title: 'Bottles secured, bar locked', proof: 'photo', proofRequired: true,
        requiresApproval: true, dueOffsetMinutes: 165 },
    ],
  },

  // ------------------------------------------------------------ HOUSEKEEPING

  {
    role: 'Housekeeping',
    shift: 'Opening',
    title: 'Housekeeping — Opening',
    items: [
      { title: 'Washrooms cleaned, stocked and checked', description: 'Both washrooms. Soap, paper, hand dryer, no odour.',
        proof: 'photo', proofRequired: true, dueOffsetMinutes: 40 },
      { title: 'Dining floor and entrance cleaned', proof: 'photo', proofRequired: true, dueOffsetMinutes: 30 },
      { title: 'Bins lined and empty, external bin area clear', proof: 'photo', dueOffsetMinutes: 45 },
      { title: 'Pest control — no droppings, bait stations intact', description: 'Check corners, under prep tables, by the bins.',
        proof: 'text', proofRequired: true, requiresApproval: true, dueOffsetMinutes: 55 },
      { title: 'Cleaning chemicals stored correctly and labelled', description: 'Never above or beside food. COSHH sheet on file.',
        proof: 'photo', dueOffsetMinutes: 50 },
    ],
  },
  {
    role: 'Housekeeping',
    shift: 'Mid',
    title: 'Housekeeping — Mid-Shift',
    items: [
      { title: 'Washrooms re-checked and restocked', proof: 'photo', proofRequired: true, dueOffsetMinutes: 60 },
      { title: 'Dining bins emptied', proof: 'none', dueOffsetMinutes: 100 },
      { title: 'Spills and breakages dealt with, wet floor signs used', proof: 'none', dueOffsetMinutes: 110 },
    ],
  },
  {
    role: 'Housekeeping',
    shift: 'Closing',
    title: 'Housekeeping — Closing',
    items: [
      { title: 'Washrooms final clean', proof: 'photo', proofRequired: true, dueOffsetMinutes: 155 },
      { title: 'All waste removed to the store, area locked', proof: 'photo', proofRequired: true, dueOffsetMinutes: 160 },
      { title: 'Grease trap checked', proof: 'text', dueOffsetMinutes: 150 },
      { title: 'Mops and cloths washed and hung to dry', proof: 'none', dueOffsetMinutes: 170 },
    ],
  },

  // ---------------------------------------------------- STORES & PURCHASING

  {
    role: 'Stores & Purchasing',
    shift: 'Opening',
    title: 'Stores — Goods In & Stock',
    items: [
      { title: 'Delivery temperature checked on arrival', description: 'Chilled below 5°C, frozen below −15°C. Reject and record if not.',
        proof: 'number', proofRequired: true, requiresApproval: true, photoMode: 'required',
        dueOffsetMinutes: 60, min: -25, max: 5, unit: '°C' },
      { title: 'Delivery checked against invoice', description: 'Quantities, damage, short deliveries noted on the note.',
        proof: 'photo', proofRequired: true, requiresApproval: true, dueOffsetMinutes: 70 },
      { title: 'Use-by dates checked, nothing short-dated accepted', proof: 'none', dueOffsetMinutes: 70 },
      { title: 'Stock rotated, FIFO maintained in dry store', proof: 'photo', proofRequired: true, dueOffsetMinutes: 90 },
      { title: 'Low stock flagged for ordering', proof: 'text', proofRequired: true, dueOffsetMinutes: 100 },
      { title: 'Dry store clean, off the floor, no open packets', proof: 'photo', dueOffsetMinutes: 95 },
    ],
  },

  // ----------------------------------------------------------- BACK OFFICE

  {
    role: 'Back Office',
    shift: 'Closing',
    title: 'Back Office — Daily Close',
    items: [
      { title: 'Day’s sales reconciled against POS report', proof: 'number', proofRequired: true,
        requiresApproval: true, photoMode: 'required', dueOffsetMinutes: 160, min: 0, max: 10000000, unit: '₹' },
      { title: 'Cash variance explained', description: 'Anything over ₹200 either way needs a written reason.',
        proof: 'text', proofRequired: true, requiresApproval: true, dueOffsetMinutes: 165 },
      { title: 'Deposit prepared and secured', proof: 'photo', proofRequired: true,
        requiresApproval: true, dueOffsetMinutes: 170 },
      { title: 'Supplier invoices filed and entered', proof: 'none', dueOffsetMinutes: 150 },
      { title: 'Discounts, voids and comps reviewed', description: 'Every void needs a manager name against it.',
        proof: 'text', proofRequired: true, requiresApproval: true, dueOffsetMinutes: 155 },
      { title: 'Staff hours confirmed for the day', proof: 'none', dueOffsetMinutes: 160 },
      { title: 'Licences and certificates still in date', description: 'Food licence, liquor licence, fire NOC, insurance.',
        proof: 'none', dueOffsetMinutes: 140 },
    ],
  },

  // ------------------------------------------------------ CUSTOMER SUPPORT

  {
    role: 'Customer Support',
    shift: 'Mid',
    title: 'Customer Support — Daily',
    items: [
      { title: 'Online reviews read and responded to', description: 'Google, Zomato, Swiggy. Every review below 3 stars gets a reply.',
        proof: 'text', proofRequired: true, dueOffsetMinutes: 90 },
      { title: 'Complaints from yesterday closed out', proof: 'text', proofRequired: true,
        requiresApproval: true, dueOffsetMinutes: 100 },
      { title: 'Callbacks made to guests who complained in person', proof: 'none', dueOffsetMinutes: 110 },
      { title: 'Feedback cards and QR responses collected', proof: 'none', dueOffsetMinutes: 120 },
      { title: 'Recurring complaint themes flagged to the manager', description: 'Three of the same complaint is a process problem, not bad luck.',
        proof: 'text', requiresApproval: true, dueOffsetMinutes: 130 },
    ],
  },

  // ------------------------------------------------------ SALES & MARKETING

  {
    role: 'Sales & Marketing',
    shift: 'Mid',
    title: 'Sales & Marketing — Daily',
    items: [
      { title: 'Promotions and offers live and correctly priced at POS',
        description: 'A promotion the POS does not know about is a refund waiting to happen.',
        proof: 'photo', proofRequired: true, requiresApproval: true, dueOffsetMinutes: 60 },
      { title: 'Social media posted as scheduled', proof: 'text', dueOffsetMinutes: 90 },
      { title: 'Menu boards, table talkers and posters current', proof: 'photo', dueOffsetMinutes: 70 },
      { title: 'Aggregator listings correct', description: 'Menu, prices, photos and opening hours on delivery apps.',
        proof: 'none', dueOffsetMinutes: 100 },
      { title: 'Yesterday’s covers and average spend reviewed', proof: 'number',
        dueOffsetMinutes: 110, min: 0, max: 100000, unit: '₹' },
      { title: 'Upcoming bookings and events confirmed', proof: 'none', dueOffsetMinutes: 120 },
    ],
  },

  // ---------------------------------------------------------- IT & SYSTEMS

  {
    role: 'IT & Systems',
    shift: 'Opening',
    title: 'IT & Systems — Daily',
    items: [
      { title: 'POS terminals online and printing', proof: 'none', dueOffsetMinutes: 20 },
      { title: 'Kitchen display / KOT printer working', proof: 'none', dueOffsetMinutes: 25 },
      { title: 'Card machines connected and settling', proof: 'none', dueOffsetMinutes: 25 },
      { title: 'Guest and staff wifi working', proof: 'none', dueOffsetMinutes: 30 },
      { title: 'CCTV recording, all cameras with a picture', description: 'Confirm the recorder has yesterday’s footage, not just a live view.',
        proof: 'photo', proofRequired: true, requiresApproval: true, dueOffsetMinutes: 40 },
      { title: 'Daily backup completed', proof: 'none', requiresApproval: true, dueOffsetMinutes: 45 },
      { title: 'Music and digital signage playing', proof: 'none', dueOffsetMinutes: 35 },
    ],
  },

  // -------------------------------------------------- MAINTENANCE & SAFETY

  {
    role: 'Maintenance & Safety',
    shift: 'Opening',
    title: 'Maintenance & Safety — Daily',
    items: [
      { title: 'Fire extinguishers in place, in date, seals intact',
        proof: 'photo', proofRequired: true, requiresApproval: true, dueOffsetMinutes: 40 },
      { title: 'Fire exits clear and unlocked', description: 'A blocked fire exit closes a restaurant. Walk the route.',
        proof: 'photo', proofRequired: true, requiresApproval: true, dueOffsetMinutes: 30 },
      { title: 'First aid kit stocked and in date', proof: 'photo', dueOffsetMinutes: 50 },
      { title: 'Gas leak check around connections', proof: 'none', requiresApproval: true, dueOffsetMinutes: 25 },
      { title: 'Electrical points, no exposed wiring or overloaded sockets', proof: 'none', dueOffsetMinutes: 55 },
      { title: 'Equipment faults logged and chased', proof: 'text', dueOffsetMinutes: 60 },
      { title: 'Water pressure and hot water available', proof: 'none', dueOffsetMinutes: 35 },
    ],
  },

  // ------------------------------------------------------------ PEOPLE & HR

  {
    role: 'People & HR',
    shift: 'Opening',
    title: 'People & HR — Daily',
    items: [
      { title: 'Attendance taken against the rota', proof: 'none', requiresApproval: true, dueOffsetMinutes: 15 },
      { title: 'Absences covered and the floor told', proof: 'text', dueOffsetMinutes: 30 },
      { title: 'Health declarations — no one working while unwell',
        description: 'Anyone with vomiting or diarrhoea in the last 48 hours must not handle food.',
        proof: 'none', requiresApproval: true, dueOffsetMinutes: 20 },
      { title: 'Grooming and uniform standards met', proof: 'photo', dueOffsetMinutes: 25 },
      { title: 'Food safety certificates still valid', proof: 'none', dueOffsetMinutes: 60 },
      { title: 'Today’s briefing delivered', description: 'Specials, out of stock, VIP bookings, yesterday’s complaints.',
        proof: 'text', proofRequired: true, dueOffsetMinutes: 45 },
    ],
  },

  // --------------------------------------------------- MANAGER SIGN-OFF

  {
    role: 'Shift Manager',
    shift: 'Closing',
    title: 'Manager — Closing Sign-off',
    items: [
      { title: 'All departments’ closing checklists reviewed', proof: 'none', dueOffsetMinutes: 175 },
      { title: 'Outstanding and locked items resolved or escalated', proof: 'text', proofRequired: true, dueOffsetMinutes: 175 },
      { title: 'Incidents, accidents or complaints logged', proof: 'text', dueOffsetMinutes: 170 },
      { title: 'Cash deposit verified and secured', proof: 'photo', proofRequired: true,
        requiresApproval: true, photoMode: 'required', dueOffsetMinutes: 175 },
      { title: 'Tomorrow’s staffing confirmed', proof: 'none', dueOffsetMinutes: 165 },
      { title: 'Final walkthrough completed', proof: 'photo', proofRequired: true, dueOffsetMinutes: 180 },
    ],
  },
];


// Roles, in hierarchy order. `level` drives escalation: a frozen item first
// reaches level 2 (Shift Manager), then climbs.
export const SEED_ROLES = [
  // Departments are roles: a checklist belongs to the department that owns the
  // work, and every department reports up the same chain.
  { name: 'Kitchen',              level: 1, canReview: false, canUnlock: false, canManage: false },
  { name: 'Front Office',         level: 1, canReview: false, canUnlock: false, canManage: false },
  { name: 'Service',              level: 1, canReview: false, canUnlock: false, canManage: false },
  { name: 'Bar & Beverage',       level: 1, canReview: false, canUnlock: false, canManage: false },
  { name: 'Housekeeping',         level: 1, canReview: false, canUnlock: false, canManage: false },
  { name: 'Stores & Purchasing',  level: 1, canReview: false, canUnlock: false, canManage: false },
  { name: 'Back Office',          level: 1, canReview: false, canUnlock: false, canManage: false },
  { name: 'Customer Support',     level: 1, canReview: false, canUnlock: false, canManage: false },
  { name: 'Sales & Marketing',    level: 1, canReview: false, canUnlock: false, canManage: false },
  { name: 'IT & Systems',         level: 1, canReview: false, canUnlock: false, canManage: false },
  { name: 'Maintenance & Safety', level: 1, canReview: false, canUnlock: false, canManage: false },
  { name: 'People & HR',          level: 1, canReview: false, canUnlock: false, canManage: false },
  { name: 'Shift Manager',        level: 2, canReview: true,  canUnlock: true,  canManage: false },
  { name: 'General Manager',      level: 3, canReview: true,  canUnlock: true,  canManage: true  },
  { name: 'Owner',                level: 4, canReview: true,  canUnlock: true,  canManage: true  },
];

export const SEED_SHIFTS = [
  { name: 'Opening', start: '07:00', end: '12:00', sort: 0 },
  { name: 'Mid',     start: '12:00', end: '18:00', sort: 1 },
  { name: 'Closing', start: '18:00', end: '23:30', sort: 2 },
];
