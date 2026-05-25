export interface VideoSlide {
  title: string;
  body: string[];
  audioBlob: Blob | null;
}

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;
const FPS = 25;

const BG_COLOR = '#0d0f14';
const ACCENT_COLOR = '#6366f1';
const TITLE_COLOR = '#ffffff';
const BODY_COLOR = '#9ca3af';
const SLIDE_NUM_COLOR = '#6b7280';

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
): number {
  const words = text.split(' ');
  let line = '';
  let currentY = y;

  for (let i = 0; i < words.length; i++) {
    const testLine = line + (line ? ' ' : '') + words[i];
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, currentY);
      line = words[i];
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) { ctx.fillText(line, x, currentY); currentY += lineHeight; }
  return currentY;
}

function drawSlide(
  ctx: CanvasRenderingContext2D,
  slide: VideoSlide,
  slideNumber: number,
  totalSlides: number
): void {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.fillStyle = ACCENT_COLOR;
  ctx.fillRect(0, 0, CANVAS_WIDTH, 6);

  ctx.font = '500 20px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = SLIDE_NUM_COLOR;
  ctx.textAlign = 'right';
  ctx.fillText(`${slideNumber} / ${totalSlides}`, CANVAS_WIDTH - 48, 56);
  ctx.textAlign = 'left';

  const paddingX = 80;
  const contentWidth = CANVAS_WIDTH - paddingX * 2;

  ctx.font = 'bold 48px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = TITLE_COLOR;
  const titleY = wrapText(ctx, slide.title, paddingX, 160, contentWidth, 64);

  ctx.font = '400 24px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = BODY_COLOR;
  let bodyY = titleY + 32;
  for (const line of slide.body) {
    if (!line.trim()) { bodyY += 16; continue; }
    ctx.fillText('·', paddingX, bodyY);
    bodyY = wrapText(ctx, line, paddingX + 24, bodyY, contentWidth - 24, 36);
    bodyY += 8;
    if (bodyY > CANVAS_HEIGHT - 80) break;
  }
}

function getSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') throw new Error('MediaRecorder is not supported in this browser.');
  const candidates = [
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return 'video/webm';
}

function getFileExtension(mimeType: string): string {
  return mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
}

async function playAudioThrough(
  blob: Blob,
  audioCtx: AudioContext,
  dest: MediaStreamAudioDestinationNode
): Promise<void> {
  try {
    const buf = await audioCtx.decodeAudioData(await blob.arrayBuffer());
    await new Promise<void>((resolve) => {
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      src.connect(dest);
      src.onended = () => resolve();
      src.start();
    });
  } catch {
    // If decode fails (format edge-case), hold the slide for estimated read time
    const estimatedMs = Math.max(3000, blob.size / 16);
    await new Promise<void>((r) => setTimeout(r, estimatedMs));
  }
}

async function renderVideo(
  slides: VideoSlide[],
  onProgress?: (current: number, total: number) => void
): Promise<{ blob: Blob; ext: string }> {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context from canvas');

  const videoStream = canvas.captureStream(FPS);
  const audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') await audioCtx.resume();
  const audioDest = audioCtx.createMediaStreamDestination();
  const audioTrack = audioDest.stream.getAudioTracks()[0];

  const tracks: MediaStreamTrack[] = [videoStream.getVideoTracks()[0]];
  if (audioTrack) tracks.push(audioTrack);
  const combinedStream = new MediaStream(tracks);

  const mimeType = getSupportedMimeType();
  const recorder = new MediaRecorder(combinedStream, { mimeType });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.start(100);

  const total = slides.length;
  for (let i = 0; i < total; i++) {
    onProgress?.(i + 1, total);
    drawSlide(ctx, slides[i], i + 1, total);
    if (slides[i].audioBlob) {
      await playAudioThrough(slides[i].audioBlob!, audioCtx, audioDest);
    } else {
      await new Promise<void>((r) => setTimeout(r, 3000));
    }
  }

  await new Promise<void>((resolve) => { recorder.onstop = () => resolve(); recorder.stop(); });
  await audioCtx.close();

  return { blob: new Blob(chunks, { type: mimeType }), ext: getFileExtension(mimeType) };
}

export async function exportVideo(
  slides: VideoSlide[],
  title: string,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  const { blob, ext } = await renderVideo(slides, onProgress);
  const safeName = title.slice(0, 60).replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}-narrated.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportVideoBlob(
  slides: VideoSlide[],
  onProgress?: (current: number, total: number) => void
): Promise<{ blob: Blob; ext: string }> {
  return renderVideo(slides, onProgress);
}
