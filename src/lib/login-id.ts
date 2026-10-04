// Test brands sign in with a short username ("manager", "owner"); every other
// account keeps using its email. A username is expanded to the brand's
// internal address.
export function loginEmail(input: string): string {
  const v = input.trim();
  return v.includes('@') ? v : `${v.toLowerCase()}@bakelore.test`;
}
