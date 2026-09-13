/**
 * Generates the departmental checklist as a Word document, from the same
 * source the app seeds from — so the printed checklist and the app can never
 * drift apart.
 *
 * Laid out like a line-check audit: department, then shift, then numbered items
 * with a tick box, the standard being checked, and columns for the response.
 */
import fs from 'fs';
import {
  AlignmentType, BorderStyle, Document, HeadingLevel, PageBreak, Packer,
  Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx';
import { SEED_TEMPLATES, SEED_ROLES } from '../archive/department-checklist/checklist-content';

const ACCENT = 'B4451F';
const INK = '1D1A17';
const MUTED = '6D655B';
const RULE = 'DDD6CD';

// Table geometry, in twentieths of a point. Column widths must sum to the
// table width or Word and Google Docs disagree about the layout.
const TOTAL = 9360;
const COLS = [620, 5340, 1200, 1100, 1100];

const departments = [...new Set(SEED_TEMPLATES.map((t) => t.role))];

function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]) {
  return new Paragraph({
    heading: level,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, color: INK, bold: true })],
  });
}

function note(text: string) {
  return new Paragraph({
    spacing: { after: 160 },
    children: [new TextRun({ text, color: MUTED, size: 19, italics: true })],
  });
}

function cell(text: string, opts: { width: number; bold?: boolean; shaded?: boolean; align?: any }) {
  return new TableCell({
    width: { size: opts.width, type: WidthType.DXA },
    shading: opts.shaded
      ? { type: ShadingType.CLEAR, fill: 'F0ECE7', color: 'auto' }
      : undefined,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: [new Paragraph({
      alignment: opts.align,
      children: [new TextRun({ text, bold: opts.bold, size: 19, color: INK })],
    })],
  });
}

function proofLabel(item: any): string {
  const bits: string[] = [];
  if (item.proof === 'photo') bits.push(item.proofRequired ? 'Photo required' : 'Photo');
  if (item.proof === 'number') {
    const range = item.min !== undefined && item.max !== undefined
      ? ` (${item.min} to ${item.max}${item.unit ?? ''})` : '';
    bits.push(`Reading${range}`);
  }
  if (item.proof === 'text') bits.push('Written note');
  if (item.photoMode === 'required') bits.push('+ photo');
  if (item.photoMode === 'optional') bits.push('+ photo optional');
  if (item.requiresApproval) bits.push('Manager approval');
  return bits.join(' · ') || 'Tick';
}

const children: any[] = [];

// Cover
children.push(
  new Paragraph({
    spacing: { before: 1200, after: 120 },
    children: [new TextRun({ text: 'DEPARTMENT CHECKLISTS', bold: true, size: 44, color: ACCENT })],
  }),
  new Paragraph({
    spacing: { after: 400 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE } },
    children: [new TextRun({ text: 'Daily operating standards by department', size: 24, color: MUTED })],
  }),
);

const totalItems = SEED_TEMPLATES.reduce((n, t) => n + t.items.length, 0);
const summaryRows = [
  new TableRow({
    children: [
      cell('Departments', { width: 4680, bold: true, shaded: true }),
      cell(String(departments.length), { width: 4680, shaded: true }),
    ],
  }),
  new TableRow({
    children: [
      cell('Checklists', { width: 4680, bold: true }),
      cell(String(SEED_TEMPLATES.length), { width: 4680 }),
    ],
  }),
  new TableRow({
    children: [
      cell('Total checks', { width: 4680, bold: true, shaded: true }),
      cell(String(totalItems), { width: 4680, shaded: true }),
    ],
  }),
  new TableRow({
    children: [
      cell('Reporting chain', { width: 4680, bold: true }),
      cell(SEED_ROLES.filter((r) => r.level > 1).map((r) => r.name).join(' → '), { width: 4680 }),
    ],
  }),
];
children.push(new Table({
  width: { size: TOTAL, type: WidthType.DXA },
  columnWidths: [4680, 4680],
  rows: summaryRows,
}));

children.push(new Paragraph({ children: [new PageBreak()] }));

// Contents
children.push(heading('Contents', HeadingLevel.HEADING_1));
for (const dept of departments) {
  const shifts = SEED_TEMPLATES.filter((t) => t.role === dept);
  const count = shifts.reduce((n, t) => n + t.items.length, 0);
  children.push(new Paragraph({
    spacing: { after: 40 },
    children: [
      new TextRun({ text: dept, bold: true, size: 21, color: INK }),
      new TextRun({
        text: `   ${shifts.map((s) => s.shift).join(', ')} · ${count} checks`,
        size: 19, color: MUTED,
      }),
    ],
  }));
}

children.push(new Paragraph({ children: [new PageBreak()] }));

// One section per department.
let qSection = 0;
for (const dept of departments) {
  qSection++;
  children.push(heading(`${qSection}. ${dept.toUpperCase()}`, HeadingLevel.HEADING_1));

  const templates = SEED_TEMPLATES.filter((t) => t.role === dept);
  let qIndex = 0;

  for (const template of templates) {
    children.push(heading(template.title, HeadingLevel.HEADING_2));
    children.push(note(`${template.items.length} checks · due within the ${template.shift.toLowerCase()} shift`));

    const rows = [
      new TableRow({
        tableHeader: true,
        children: [
          cell('#', { width: COLS[0], bold: true, shaded: true }),
          cell('Check and standard', { width: COLS[1], bold: true, shaded: true }),
          cell('Evidence', { width: COLS[2], bold: true, shaded: true }),
          cell('Due', { width: COLS[3], bold: true, shaded: true, align: AlignmentType.CENTER }),
          cell('Result', { width: COLS[4], bold: true, shaded: true, align: AlignmentType.CENTER }),
        ],
      }),
    ];

    for (const item of template.items) {
      qIndex++;
      const detail = item.description ? `  —  ${item.description}` : '';
      rows.push(new TableRow({
        children: [
          cell(`${qSection}.${qIndex}`, { width: COLS[0] }),
          new TableCell({
            width: { size: COLS[1], type: WidthType.DXA },
            margins: { top: 60, bottom: 60, left: 90, right: 90 },
            children: [new Paragraph({
              children: [
                new TextRun({ text: item.title, bold: true, size: 19, color: INK }),
                ...(detail ? [new TextRun({ text: detail, size: 18, color: MUTED })] : []),
              ],
            })],
          }),
          cell(proofLabel(item), { width: COLS[2] }),
          cell(`+${item.dueOffsetMinutes} min`, { width: COLS[3], align: AlignmentType.CENTER }),
          cell('☐ Yes   ☐ No', { width: COLS[4], align: AlignmentType.CENTER }),
        ],
      }));
    }

    children.push(new Table({
      width: { size: TOTAL, type: WidthType.DXA },
      columnWidths: COLS,
      rows,
    }));
    children.push(new Paragraph({ spacing: { after: 160 }, children: [] }));
  }

  children.push(new Paragraph({ children: [new PageBreak()] }));
}

// How the app treats these.
children.push(heading('How these are enforced', HeadingLevel.HEADING_1));
for (const line of [
  'Each check belongs to a department and a shift. Staff see only their own department’s list for the shift they are on.',
  'A check that passes its due time without being completed is locked. Only a manager can reopen it, and only with a written reason that is recorded permanently.',
  'If a locked check is still outstanding after the escalation window, the next level up gains the ability to reopen it. The original manager keeps theirs.',
  'Readings outside their stated range alert the manager immediately, whether or not the check needs approval. A reading can be re-taken after the problem is fixed; the original is kept.',
  'Manager completions and waivers are recorded separately from staff completions, and are shown to the owner.',
]) {
  children.push(new Paragraph({
    spacing: { after: 100 },
    bullet: { level: 0 },
    children: [new TextRun({ text: line, size: 20, color: INK })],
  }));
}

const doc = new Document({
  creator: 'Restaurant Checklist',
  title: 'Department Checklists',
  styles: {
    default: {
      document: { run: { font: 'Calibri', size: 20, color: INK } },
      heading1: { run: { font: 'Calibri', size: 30, bold: true, color: ACCENT } },
      heading2: { run: { font: 'Calibri', size: 24, bold: true, color: INK } },
    },
  },
  sections: [{
    properties: { page: { margin: { top: 900, bottom: 900, left: 900, right: 900 } } },
    children,
  }],
});

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync('Department-Checklists.docx', buffer);
  console.log(`written: ${departments.length} departments, ${SEED_TEMPLATES.length} checklists, ${totalItems} checks`);
});
