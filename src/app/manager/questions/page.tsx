import { redirect } from 'next/navigation';

// This page moved; keep the old link working.
export default function Moved() {
  redirect('/l3/add-questions');
}
