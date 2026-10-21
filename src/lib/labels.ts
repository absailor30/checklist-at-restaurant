// What each level is called on screen. The levels themselves stay 1, 2 and 3 in the
// database and the code; only the wording shown to people comes from here.
export const L1_LABEL = 'Manager Line Check';
export const L2_LABEL = 'Operations Manager';
export const L3_LABEL = 'CEO/Owner';

const ROLE_LABELS: Record<string, string> = {
  'L1 Manager': L1_LABEL,
  'L2 Manager': L2_LABEL,
  'L3 Owner': L3_LABEL,
};

/** A role name from the database, as it should read on screen. Other roles are left as they are. */
export const roleLabel = (name?: string | null): string => (name ? ROLE_LABELS[name] ?? name : '');
