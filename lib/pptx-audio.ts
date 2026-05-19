import JSZip from 'jszip';

export async function embedAudioInPptx(
  pptxBuffer: ArrayBuffer,
  audioBlobs: (Blob | null)[]
): Promise<Blob> {
  const zip = await JSZip.loadAsync(pptxBuffer);
  const slideFiles = await getOrderedSlideFiles(zip);
  await ensureMp3ContentType(zip);

  for (let i = 0; i < slideFiles.length; i++) {
    const blob = audioBlobs[i];
    if (!blob) continue;

    const slideFile = slideFiles[i];
    const n = i + 1;
    const shapeId = 9000 + n;
    const rId = `rIdNarr${n}`;
    const mediaName = `narr${String(n).padStart(3, '0')}.mp3`;
    const timingBase = 90000 + i * 10;

    // Embed MP3
    zip.file(`ppt/media/${mediaName}`, await blob.arrayBuffer());

    // Add relationship
    const relsPath = slideFile
      .replace('ppt/slides/', 'ppt/slides/_rels/')
      .replace('.xml', '.xml.rels');
    let relsXml =
      (await zip.file(relsPath)?.async('text')) ??
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    relsXml = relsXml.replace(
      '</Relationships>',
      `  <Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio" Target="../media/${mediaName}"/>\n</Relationships>`
    );
    zip.file(relsPath, relsXml);

    // Modify slide XML
    let slideXml = await zip.file(slideFile)!.async('text');
    slideXml = slideXml.replace('</p:spTree>', audioShapeXml(shapeId, rId, n) + '\n</p:spTree>');
    slideXml = addAutoPlayTiming(slideXml, shapeId, timingBase);
    zip.file(slideFile, slideXml);
  }

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
}

function audioShapeXml(shapeId: number, rId: string, n: number): string {
  // hlinkClick intentionally omitted — auto-play is handled via timing;
  // including it with the 'audio' rel type causes PowerPoint to reject it
  return `<p:sp>
      <p:nvSpPr>
        <p:cNvPr id="${shapeId}" name="NarratorAudio${n}"/>
        <p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>
        <p:nvPr><p:audioFile r:link="${rId}"/></p:nvPr>
      </p:nvSpPr>
      <p:spPr>
        <a:xfrm>
          <a:off x="8686800" y="6248400"/>
          <a:ext cx="457200" cy="457200"/>
        </a:xfrm>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
      </p:spPr>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>
    </p:sp>`;
}

function addAutoPlayTiming(slideXml: string, shapeId: number, base: number): string {
  const audioPar = `<p:par>
          <p:cTn id="${base + 1}" fill="hold">
            <p:stCondLst><p:cond delay="0"/></p:stCondLst>
            <p:childTnLst>
              <p:audio>
                <p:cMediaNode vol="80000" mute="0" numSld="0" showWhenStopped="0">
                  <p:cTn id="${base + 2}" fill="hold">
                    <p:stCondLst><p:cond delay="0"/></p:stCondLst>
                  </p:cTn>
                  <p:tgtEl><p:spTgt spid="${shapeId}"/></p:tgtEl>
                </p:cMediaNode>
              </p:audio>
            </p:childTnLst>
          </p:cTn>
        </p:par>`;

  if (!slideXml.includes('<p:timing>')) {
    // No animations: create fresh timing block with auto-play
    const timing = `<p:timing>
    <p:tnLst>
      <p:par>
        <p:cTn id="${base}" dur="indefinite" restart="whenNotActive" nodeType="tmRoot">
          <p:childTnLst>
            <p:seq concurrent="1" nextAc="seek">
              <p:cTn id="${base + 3}" dur="indefinite" nodeType="mainSeq">
                <p:childTnLst>
                  <p:par>
                    <p:cTn id="${base + 4}" fill="hold">
                      <p:stCondLst><p:cond delay="indefinite"/></p:stCondLst>
                    </p:cTn>
                  </p:par>
                </p:childTnLst>
              </p:cTn>
            </p:seq>
            ${audioPar}
          </p:childTnLst>
        </p:cTn>
      </p:par>
    </p:tnLst>
    <p:bldLst>
      <p:bldP spid="${shapeId}" grpId="0" build="p"/>
    </p:bldLst>
  </p:timing>`;
    return slideXml.replace('</p:sld>', timing + '\n</p:sld>');
  }

  // Has existing animations: add audio par as sibling of the main seq,
  // inside the tmRoot's childTnLst, so it plays at t=0 regardless of clicks
  const tmRootIdx = slideXml.indexOf('nodeType="tmRoot"');
  if (tmRootIdx === -1) return slideXml;
  const closeIdx = findMatchingChildTnLstClose(slideXml, tmRootIdx);
  if (closeIdx === -1) return slideXml;
  return slideXml.slice(0, closeIdx) + '\n' + audioPar + slideXml.slice(closeIdx);
}

function findMatchingChildTnLstClose(xml: string, afterIdx: number): number {
  const OPEN = '<p:childTnLst>';
  const CLOSE = '</p:childTnLst>';
  const openIdx = xml.indexOf(OPEN, afterIdx);
  if (openIdx === -1) return -1;

  let depth = 1;
  let i = openIdx + OPEN.length;
  while (depth > 0 && i < xml.length) {
    const nextOpen = xml.indexOf(OPEN, i);
    const nextClose = xml.indexOf(CLOSE, i);
    if (nextClose === -1) return -1;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      i = nextOpen + OPEN.length;
    } else {
      depth--;
      if (depth === 0) return nextClose;
      i = nextClose + CLOSE.length;
    }
  }
  return -1;
}

async function getOrderedSlideFiles(zip: JSZip): Promise<string[]> {
  const presRels = await zip.file('ppt/_rels/presentation.xml.rels')!.async('text');
  const presXml = await zip.file('ppt/presentation.xml')!.async('text');

  const rIdToTarget = new Map<string, string>();
  for (const m of presRels.matchAll(/Id="([^"]+)"[^>]+Target="([^"]+)"/g)) {
    rIdToTarget.set(m[1], m[2]);
  }

  return [...presXml.matchAll(/p:sldId[^>]+r:id="([^"]+)"/g)]
    .map((m) => {
      const t = rIdToTarget.get(m[1]);
      return t ? `ppt/${t}` : null;
    })
    .filter(Boolean) as string[];
}

async function ensureMp3ContentType(zip: JSZip): Promise<void> {
  const f = zip.file('[Content_Types].xml');
  if (!f) return;
  let xml = await f.async('text');
  if (!xml.includes('Extension="mp3"')) {
    xml = xml.replace('</Types>', '  <Default Extension="mp3" ContentType="audio/mpeg"/>\n</Types>');
    zip.file('[Content_Types].xml', xml);
  }
}
