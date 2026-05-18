import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import type { ParsedSlide } from './types';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) =>
    ['p:sp', 'a:p', 'a:r', 'a:fld', 'p:sldId', 'Relationship'].includes(name),
});

function resolvePath(base: string, target: string): string {
  const parts = base.split('/');
  parts.pop();
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

function textsFromTxBody(txBody: Record<string, unknown>): string[] {
  const paragraphs = txBody['a:p'] as Record<string, unknown>[] | undefined;
  if (!paragraphs) return [];

  return paragraphs.flatMap((para) => {
    const runs = (para['a:r'] as Record<string, unknown>[]) ?? [];
    const fields = (para['a:fld'] as Record<string, unknown>[]) ?? [];
    const allRuns = [...runs, ...fields];
    const text = allRuns.map((r) => (r['a:t'] as string) ?? '').join('');
    return text.trim() ? [text.trim()] : [];
  });
}

function parseTitleAndBody(slideXml: string): { title: string; body: string[] } {
  const doc = parser.parse(slideXml) as Record<string, unknown>;
  const spTree = (
    (doc['p:sld'] as Record<string, unknown>)?.['p:cSld'] as Record<string, unknown>
  )?.['p:spTree'] as Record<string, unknown>;

  if (!spTree) return { title: '', body: [] };

  const shapes = (spTree['p:sp'] as Record<string, unknown>[]) ?? [];
  let title = '';
  const body: string[] = [];

  for (const shape of shapes) {
    const nvPr = (
      (shape['p:nvSpPr'] as Record<string, unknown>)?.['p:nvPr'] as Record<string, unknown>
    );
    const ph = nvPr?.['p:ph'] as Record<string, unknown> | undefined;
    const phType = ph?.['@_type'] as string | undefined;
    const txBody = shape['p:txBody'] as Record<string, unknown> | undefined;
    if (!txBody) continue;

    const texts = textsFromTxBody(txBody);
    if (phType === 'title' || phType === 'ctrTitle') {
      title = texts.join(' ');
    } else {
      body.push(...texts);
    }
  }

  return { title, body };
}

function parseNotes(notesXml: string): string {
  const doc = parser.parse(notesXml) as Record<string, unknown>;
  const spTree = (
    (doc['p:notes'] as Record<string, unknown>)?.['p:cSld'] as Record<string, unknown>
  )?.['p:spTree'] as Record<string, unknown>;

  if (!spTree) return '';

  const shapes = (spTree['p:sp'] as Record<string, unknown>[]) ?? [];
  for (const shape of shapes) {
    const nvPr = (
      (shape['p:nvSpPr'] as Record<string, unknown>)?.['p:nvPr'] as Record<string, unknown>
    );
    const ph = nvPr?.['p:ph'] as Record<string, unknown> | undefined;
    const phType = ph?.['@_type'] as string | undefined;
    const phIdx = ph?.['@_idx'] as string | undefined;

    if (phType === 'body' || phIdx === '1') {
      const txBody = shape['p:txBody'] as Record<string, unknown> | undefined;
      if (txBody) return textsFromTxBody(txBody).join('\n');
    }
  }
  return '';
}

export async function parsePptx(buffer: ArrayBuffer): Promise<ParsedSlide[]> {
  const zip = await JSZip.loadAsync(buffer);

  // Resolve slide order via presentation relationships
  const presRelsXml = await zip.file('ppt/_rels/presentation.xml.rels')?.async('text');
  if (!presRelsXml) throw new Error('Invalid PPTX: missing presentation relationships');

  const presRels = parser.parse(presRelsXml) as Record<string, unknown>;
  const rels = (
    (presRels['Relationships'] as Record<string, unknown>)?.['Relationship'] as Record<string, unknown>[]
  ) ?? [];

  const slideRelMap = new Map<string, string>();
  for (const rel of rels) {
    const type = rel['@_Type'] as string;
    if (type?.includes('/slide') && !type.includes('Layout') && !type.includes('Master')) {
      slideRelMap.set(rel['@_Id'] as string, rel['@_Target'] as string);
    }
  }

  const presXml = await zip.file('ppt/presentation.xml')?.async('text');
  if (!presXml) throw new Error('Invalid PPTX: missing presentation.xml');

  const pres = parser.parse(presXml) as Record<string, unknown>;
  const sldIds = (
    (pres['p:presentation'] as Record<string, unknown>)?.['p:sldIdLst'] as Record<string, unknown>
  )?.['p:sldId'] as Record<string, unknown>[] ?? [];

  const slideFiles = sldIds
    .map((s) => slideRelMap.get(s['@_r:id'] as string))
    .filter((p): p is string => !!p)
    .map((p) => `ppt/${p}`);

  const slides: ParsedSlide[] = [];

  for (let i = 0; i < slideFiles.length; i++) {
    const slidePath = slideFiles[i];
    const slideXml = await zip.file(slidePath)?.async('text');
    if (!slideXml) continue;

    const { title, body } = parseTitleAndBody(slideXml);

    // Resolve notes from slide relationships
    const slideRelsPath = slidePath.replace(/^(ppt\/slides\/)(.+)$/, '$1_rels/$2.rels');
    let notes = '';

    const slideRelsXml = await zip.file(slideRelsPath)?.async('text');
    if (slideRelsXml) {
      const slideRels = parser.parse(slideRelsXml) as Record<string, unknown>;
      const slideRelsList = (
        (slideRels['Relationships'] as Record<string, unknown>)?.['Relationship'] as Record<string, unknown>[]
      ) ?? [];

      const notesRel = slideRelsList.find((r) =>
        (r['@_Type'] as string)?.includes('/notesSlide')
      );
      if (notesRel) {
        const notesPath = resolvePath(slidePath, notesRel['@_Target'] as string);
        const notesXml = await zip.file(notesPath)?.async('text');
        if (notesXml) notes = parseNotes(notesXml);
      }
    }

    slides.push({
      index: i,
      title: title || `Slide ${i + 1}`,
      body,
      notes,
    });
  }

  return slides;
}
