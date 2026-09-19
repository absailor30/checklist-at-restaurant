import { redirect } from 'next/navigation';

// The owner's reporting moved to /l3 — it now reports on the L1/L2/L3 line
// check instead of the old department-checklist data model.
export default function OwnerRedirect() {
  redirect('/l3');
}
