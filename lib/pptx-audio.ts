import JSZip from 'jszip';

export async function embedAudioInPptx(
  pptxBuffer: ArrayBuffer,
  audioBlobs: (Blob | null)[]
): Promise<{ blob: Blob; embedded: number; total: number }> {
  const zip = await JSZip.loadAsync(pptxBuffer);
  const slideFiles = await getOrderedSlideFiles(zip);
  await ensureMp3ContentType(zip);

  let embedded = 0;

  for (let i = 0; i < slideFiles.length; i++) {
    const blob = audioBlobs[i];
    if (!blob) continue;
    embedded++;

    const slideFile = slideFiles[i];
    const n = i + 1;
    const shapeId = 9000 + n;
    const rId = `rIdNarr${n}`;
    const rIdMedia = `rIdNarrM${n}`;
    const mediaName = `narr${String(n).padStart(3, '0')}.mp3`;
    const base = 90000 + i * 10;

    // Embed MP3
    zip.file(`ppt/media/${mediaName}`, await blob.arrayBuffer());

    // Two relationships required:
    //   r:link on p:audioFile → "audio" type
    //   r:id on a:hlinkClick  → "media" type (Microsoft extension)
    const relsPath = slideFile
      .replace('ppt/slides/', 'ppt/slides/_rels/')
      .replace('.xml', '.xml.rels');
    let relsXml =
      (await zip.file(relsPath)?.async('text')) ??
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    relsXml = relsXml.replace(
      '</Relationships>',
      `  <Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio" Target="../media/${mediaName}"/>
  <Relationship Id="${rIdMedia}" Type="http://schemas.microsoft.com/office/2007/relationships/media" Target="../media/${mediaName}"/>
</Relationships>`
    );
    zip.file(relsPath, relsXml);

    // Modify slide XML — strip any previous NarratorAudio elements first (idempotent)
    let slideXml = await zip.file(slideFile)!.async('text');
    slideXml = stripNarratorAudio(slideXml);
    slideXml = slideXml.replace(
      '</p:spTree>',
      audioShapeXml(shapeId, rId, rIdMedia, n) + '\n</p:spTree>'
    );
    slideXml = injectTiming(slideXml, shapeId, base);
    zip.file(slideFile, slideXml);
  }

  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
  return { blob, embedded, total: slideFiles.length };
}

// PowerPoint requires p:pic (not p:sp) for media objects — p:sp is ignored as audio
function audioShapeXml(shapeId: number, rId: string, rIdMedia: string, n: number): string {
  return `<p:pic>
      <p:nvPicPr>
        <p:cNvPr id="${shapeId}" name="NarratorAudio${n}">
          <a:hlinkClick r:id="${rIdMedia}" action="ppaction://media"/>
        </p:cNvPr>
        <p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>
        <p:nvPr><p:audioFile r:link="${rId}"/></p:nvPr>
      </p:nvPicPr>
      <p:blipFill>
        <a:blip/>
        <a:stretch><a:fillRect/></a:stretch>
      </p:blipFill>
      <p:spPr>
        <a:xfrm>
          <a:off x="8686800" y="6248400"/>
          <a:ext cx="457200" cy="457200"/>
        </a:xfrm>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
      </p:spPr>
    </p:pic>`;
}

// Audio par with delay="0" — plays the moment the slide is displayed (not on click)
function buildAudioPar(shapeId: number, base: number): string {
  return `<p:par>
                  <p:cTn id="${base + 2}" fill="hold">
                    <p:stCondLst><p:cond delay="0"/></p:stCondLst>
                    <p:childTnLst>
                      <p:par>
                        <p:cTn id="${base + 3}" fill="hold">
                          <p:stCondLst><p:cond delay="0"/></p:stCondLst>
                          <p:childTnLst>
                            <p:audio>
                              <p:cMediaNode vol="80000" mute="0" numSld="0" showWhenStopped="1">
                                <p:cTn id="${base + 4}" fill="hold">
                                  <p:stCondLst><p:cond delay="0"/></p:stCondLst>
                                </p:cTn>
                                <p:tgtEl><p:spTgt spid="${shapeId}"/></p:tgtEl>
                              </p:cMediaNode>
                            </p:audio>
                          </p:childTnLst>
                        </p:cTn>
                      </p:par>
                    </p:childTnLst>
                  </p:cTn>
                </p:par>`;
}

function injectTiming(slideXml: string, shapeId: number, base: number): string {
  const ap = buildAudioPar(shapeId, base);

  if (!slideXml.includes('<p:timing>')) {
    // No existing timing — build a minimal structure that auto-plays the audio
    const timing = `<p:timing>
    <p:tnLst>
      <p:par>
        <p:cTn id="${base}" dur="indefinite" restart="whenNotActive" nodeType="tmRoot">
          <p:childTnLst>
            <p:seq concurrent="1" nextAc="seek">
              <p:cTn id="${base + 1}" dur="indefinite" nodeType="mainSeq">
                <p:childTnLst>
                  ${ap}
                </p:childTnLst>
              </p:cTn>
            </p:seq>
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

  // Has existing animations — prepend audio as first item inside mainSeq.
  // delay="0" makes it play on slide entry before any click-triggered animations.
  const mainSeqIdx = slideXml.indexOf('nodeType="mainSeq"');
  if (mainSeqIdx === -1) return slideXml;
  const tag = '<p:childTnLst>';
  const insertAt = slideXml.indexOf(tag, mainSeqIdx);
  if (insertAt === -1) return slideXml;
  const pos = insertAt + tag.length;
  return slideXml.slice(0, pos) + '\n' + ap + slideXml.slice(pos);
}

function stripNarratorAudio(xml: string): string {
  // Remove any existing NarratorAudio p:pic or p:sp elements left by a prior export
  xml = xml.replace(/<p:pic>[\s\S]*?<p:cNvPr[^>]+name="NarratorAudio\d+"[\s\S]*?<\/p:pic>/g, '');
  xml = xml.replace(/<p:sp>[\s\S]*?<p:cNvPr[^>]+name="NarratorAudio\d+"[\s\S]*?<\/p:sp>/g, '');
  return xml;
}

async function getOrderedSlideFiles(zip: JSZip): Promise<string[]> {
  const presRels = (await zip.file('ppt/_rels/presentation.xml.rels')?.async('text')) ?? '';
  const presXml = (await zip.file('ppt/presentation.xml')?.async('text')) ?? '';

  // Extract Id→Target from each <Relationship> element — attribute order varies per authoring tool
  const rIdToTarget = new Map<string, string>();
  for (const m of presRels.matchAll(/<Relationship[^>]+>/g)) {
    const el = m[0];
    const id = el.match(/\bId="([^"]+)"/)?.[1];
    const target = el.match(/\bTarget="([^"]+)"/)?.[1];
    if (id && target) rIdToTarget.set(id, target);
  }

  // Extract r:id from each <p:sldId> element — attribute order varies too
  const slideFiles: string[] = [];
  for (const m of presXml.matchAll(/<p:sldId[^/]+\/>/g)) {
    const rid = m[0].match(/r:id="([^"]+)"/)?.[1];
    const target = rid && rIdToTarget.get(rid);
    if (target) slideFiles.push(`ppt/${target}`);
  }
  return slideFiles;
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
