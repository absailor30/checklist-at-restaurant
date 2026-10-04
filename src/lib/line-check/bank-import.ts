import * as XLSX from 'xlsx';

// Turns a per-product line-check sheet (section header rows, then one row per
// product with Required Temp / Shelf Life / Product Standard columns) into a
// brand's L1 bank: each section becomes a station, each product one question.

export interface ImportedQuestion {
  prompt: string;
  kind: 'numeric' | 'yes_no';
  unit: string | null;
  min: number | null;
  max: number | null;
  notes: string | null;
  /** The part of notes before the (often repeated, long) Product Standard text. */
  notesHead: string;
  /** The Product Standard text on its own; stored once per distinct text in the seed SQL. */
  standard: string | null;
  yesLabel: string | null;
}

export interface ImportedStation {
  name: string;
  questions: ImportedQuestion[];
}

const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();

// "SAVORY KITCHEN" -> "Savory Kitchen"; keeps "&".
function titleCase(s: string) {
  return s.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (_, a, b) => a + b.toUpperCase());
}

const norm = (t: string) => t.replace(/[\u2212\u2013\u2014]/g, '-');

// Acceptable limits from the Required Temp and Product Standard columns together,
// always taking the strictest value mentioned:
//  - cold items: the lowest upper limit ("0-5C" and "<=5C" -> 5; "<=-5C" beats both -> -5)
//  - hot items (any figure >= 50C): the lowest figure mentioned is the minimum
// Rows that mention no temperature ("Ambient", "As per SOP") return null and are
// checked as pass/fail instead.
function parseLimits(required: string, standard: string): { min?: number; max?: number } | null {
  const text = norm(`${required} ${standard}`);
  const values: number[] = [];
  const uppers: number[] = [];
  let rangeLo: number | null = null;

  const rangeRe = /(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\s*\u00b0\s*C/gi;
  const leRe = /\u2264\s*(-?\d+(?:\.\d+)?)\s*\u00b0\s*C/gi;
  for (const m of text.matchAll(rangeRe)) {
    const lo = Number(m[1]); const hi = Number(m[2]);
    values.push(lo, hi); uppers.push(hi);
    if (rangeLo === null) rangeLo = lo;
  }
  for (const m of text.matchAll(leRe)) { values.push(Number(m[1])); uppers.push(Number(m[1])); }
  const rest = text.replace(rangeRe, ' ').replace(leRe, ' ');
  for (const m of rest.matchAll(/(-?\d+(?:\.\d+)?)\s*\u00b0\s*C/gi)) values.push(Number(m[1]));

  if (values.length === 0) return null;
  if (values.some((v) => v >= 50)) return { min: Math.min(...values) };

  const max = Math.min(...uppers);
  return { max, ...(rangeLo !== null && rangeLo <= max ? { min: rangeLo } : {}) };
}

export function parseBakeryLineCheck(buffer: Buffer | ArrayBuffer): ImportedStation[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });

  const headerAt = rows.findIndex((r) => clean(r[0]).toUpperCase() === 'PRODUCT NAME');
  if (headerAt < 0) throw new Error('Could not find the "PRODUCT NAME" header row.');

  const stations: ImportedStation[] = [];
  for (const r of rows.slice(headerAt + 1)) {
    const name = clean(r[0]);
    if (!name) continue;
    // The footer (sign-off lines, notes) starts here.
    if (/^(issues requiring|corrective action completed|manager|notes$)/i.test(name)) break;

    const required = clean(r[1]);
    const shelf = clean(r[2]);
    const standard = clean(r[3]);

    // A section header has only a name; a product has a Required Temp.
    if (!required && !shelf && !standard) {
      stations.push({ name: titleCase(name), questions: [] });
      continue;
    }
    const station = stations[stations.length - 1];
    if (!station) continue;

    const range = parseLimits(required, standard);
    const head = [
      required && `Required: ${required}`,
      shelf && shelf !== 'N/A' && `Shelf life: ${shelf}`,
    ].filter(Boolean) as string[];
    const parts = [...head, ...(standard ? [`Standard: ${standard}`] : [])];

    station.questions.push({
      prompt: range ? `${name} — temperature` : `${name} — meets standard?`,
      kind: range ? 'numeric' : 'yes_no',
      unit: range ? '°C' : null,
      min: range?.min ?? null,
      max: range?.max ?? null,
      notes: parts.join(' · ') || null,
      notesHead: head.join(' · '),
      standard: standard || null,
      // Ambient storage rows read "Yes (Ambient, cool)" so the staff member confirms the condition, not just "yes".
      yesLabel: !range && /^ambien/i.test(required) ? 'Yes (Ambient, cool)' : null,
    });
  }
  return stations.filter((s) => s.questions.length > 0);
}

/** Combines the named sections into one station (placed where the first one was). */
export function mergeStations(stations: ImportedStation[], names: string[], mergedName: string): ImportedStation[] {
  const parts = stations.filter((st) => names.includes(st.name));
  if (parts.length < 2) return stations;
  const merged: ImportedStation = { name: mergedName, questions: parts.flatMap((st) => st.questions) };
  const first = stations.findIndex((st) => names.includes(st.name));
  return stations.flatMap((st, i) => (i === first ? [merged] : names.includes(st.name) ? [] : [st]));
}

const sqlStr = (v: string | null) => (v === null ? 'null' : `'${v.replace(/'/g, "''")}'`);
const sqlNum = (v: number | null) => (v === null ? 'null' : String(v));

/** SQL that installs the bank for an existing organisation, by name. */
export function bankToSql(orgName: string, stations: ImportedStation[], slug: string): string {
  const names = JSON.stringify(stations.map((s) => s.name));
  const out: string[] = [];
  out.push(`-- L1 bank for "${orgName}": ${stations.length} stations, ${stations.reduce((n, s) => n + s.questions.length, 0)} questions.`);
  const stds = [...new Set(stations.flatMap((st) => st.questions.map((q) => q.standard)).filter((x): x is string => Boolean(x)))];
  out.push(`do $$ declare v_org uuid; std text[] := array[`);
  out.push(stds.map((x) => `    ${sqlStr(x)}`).join(',\n'));
  out.push(`  ]; begin`);
  out.push(`  select id into v_org from organisations where name = ${sqlStr(orgName)};`);
  out.push(`  if v_org is null then raise exception 'Organisation % not found', ${sqlStr(orgName)}; end if;`);
  out.push(`  update organisations set line_check_config = coalesce(line_check_config, '{}'::jsonb)`);
  out.push(`    || jsonb_build_object('stationNames', '${names.replace(/'/g, "''")}'::jsonb, 'hardStop', 'none', 'askCheckTime', true, 'shiftLabels', jsonb_build_object('morning', 'Opening', 'afternoon', 'Mid Shift', 'evening', 'Closing')) where id = v_org;`);
  out.push(`  update outlets set station_count = ${stations.length} where org_id = v_org;`);
  out.push(`  insert into line_check_questions (id, level, sort_order, kind, prompt, expected, unit, min_value, max_value, photo_required, reason_on_no, notes, org_id, station_no, yes_label) values`);
  const vals: string[] = [];
  stations.forEach((st, si) => {
    st.questions.forEach((q, qi) => {
      const id = `${slug}-s${si + 1}-q${qi + 1}`;
      const notes = q.standard
        ? `${sqlStr(q.notesHead ? `${q.notesHead} · Standard: ` : 'Standard: ')} || std[${stds.indexOf(q.standard) + 1}]`
        : sqlStr(q.notes);
      vals.push(
        `    (${sqlStr(id)}, 'L1', ${qi + 1}, ${sqlStr(q.kind)}, ${sqlStr(q.prompt)}, ${q.kind === 'yes_no' ? "'yes'" : 'null'}, ${sqlStr(q.unit)}, ${sqlNum(q.min)}, ${sqlNum(q.max)}, ${q.kind === 'numeric'}, false, ${notes}, v_org, ${si + 1}, ${sqlStr(q.yesLabel)})`
      );
    });
  });
  out.push(vals.join(',\n'));
  out.push(`  on conflict (id) do update set sort_order = excluded.sort_order, kind = excluded.kind, prompt = excluded.prompt,`);
  out.push(`    expected = excluded.expected, unit = excluded.unit, min_value = excluded.min_value, max_value = excluded.max_value,`);
  out.push(`    notes = excluded.notes, station_no = excluded.station_no, yes_label = excluded.yes_label, photo_required = excluded.photo_required;`);
  out.push(`end $$;`);
  return out.join('\n') + '\n';
}
