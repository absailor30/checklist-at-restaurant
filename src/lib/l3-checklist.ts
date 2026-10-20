// L3's quick oversight checklist. A brand can replace the items with
// line_check_config.l3Checklist = [{ "key": "...", "prompt": "..." }].
export interface L3Item { key: string; prompt: string }

export const DEFAULT_L3_ITEMS: L3Item[] = [
  { key: 'line-checks', prompt: 'Line checks being done regularly' },
  { key: 'fssai-audits', prompt: 'Monthly FSSAI audits done' },
  { key: 'cleanliness', prompt: 'Cleanliness maintained in the restaurant' },
  { key: 'service-steps', prompt: 'Steps of service being followed' },
  { key: 'suggestive-selling', prompt: 'Suggestive selling being followed' },
];

export function l3ItemsOf(config: any): L3Item[] {
  const own = config?.l3Checklist;
  if (Array.isArray(own) && own.length && own.every((x: any) => x?.key && x?.prompt)) return own as L3Item[];
  return DEFAULT_L3_ITEMS;
}
