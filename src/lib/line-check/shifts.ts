// The three shift slots the data model stores. A brand can use fewer of them
// (config.activeShifts) and can show its own names for them (config.shiftLabels).
export const ALL_SHIFTS = ['morning', 'afternoon', 'evening'] as const;
export type Shift = (typeof ALL_SHIFTS)[number];

export function activeShiftsOf(config: { activeShifts?: string[] } | null | undefined): Shift[] {
  const list = (config?.activeShifts ?? []).filter((s): s is Shift => (ALL_SHIFTS as readonly string[]).includes(s));
  return list.length ? list : [...ALL_SHIFTS];
}
