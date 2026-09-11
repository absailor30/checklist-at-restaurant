import { NextResponse } from 'next/server';

// Every response here reflects live database state, so none of it may be
// cached. Without this, a browser or CDN can keep serving an answer from
// before the data existed — an empty outlet list stayed empty on the staff
// screen long after the outlets were created.
export function json(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
    },
  });
}
