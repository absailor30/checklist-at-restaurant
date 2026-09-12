// A failed query and an empty result are not the same thing, and code that
// destructures only `data` cannot tell them apart.
//
// That is not hypothetical: an ambiguous relationship hint made the submissions
// query fail outright, and because the error was discarded, every completed
// task appeared as still to do — to staff, to managers and on the dashboard.
// The app looked like it had lost the work.
//
// unwrap() makes a failed query loud. Callers that genuinely tolerate missing
// data should use `?? []` on the result, not swallow the error.
export function unwrap<T>(
  result: { data: T | null; error: { message: string } | null },
  label: string
): T {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
  return (result.data ?? []) as T;
}
