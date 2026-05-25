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
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line) {
      ctx.fillText(line, x, currentY);
      line = words[i];
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) {
    ctx.fillText(line, x, currentY);
    currentY += lineHeight;
  }
  return currentY;
}

function drawSlide(
  ctx: CanvasRenderingContext2D,
  slide: VideoSlide,
  slideNumber: number,
  totalSlides: number
): void {
  // Background
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Accent top bar
  ctx.fillStyle = ACCENT_COLOR;
  ctx.fillRect(0, 0, CANVAS_WIDTH, 6);

  // Slide number (top-right)
  ctx.font = '500 20px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = SLIDE_NUM_COLOR;
  ctx.textAlign = 'right';
  ctx.fillText(`${slideNumber} / ${totalSlides}`, CANVAS_WIDTH - 48, 56);
  ctx.textAlign = 'left';

  const paddingX = 80;
  const contentWidth = CANVAS_WIDTH - paddingX * 2;

  // Title
  ctx.font = 'bold 48px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = TITLE_COLOR;
  const titleY = wrapText(ctx, slide.title, paddingX, 160, contentWidth, 64);

  // Body lines
  ctx.font = '400 24px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = BODY_COLOR;
  let bodyY = titleY + 32;
  for (const line of slide.body) {
    if (!line.trim()) {
      bodyY += 16;
      continue;
    }
    // Bullet
    ctx.fillText('·', paddingX, bodyY);
    bodyY = wrapText(ctx, line, paddingX + 24, bodyY, contentWidth - 24, 36);
    bodyY += 8;
    if (bodyY > CANVAS_HEIGHT - 80) break;
  }
}

function getSupportedMimeType(): string {
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

export async function exportVideo(
  slides: VideoSlide[],
  title: string,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  // Create offscreen canvas
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context from canvas');

  // Set up video stream from canvas
  const videoStream = canvas.captureStream(FPS);
  const videoTrack = videoStream.getVideoTracks()[0];

  // Set up audio context and destination
  const audioCtx = new AudioContext();
  const audioDest = audioCtx.createMediaStreamDestination();
  const audioTrack = audioDest.stream.getAudioTracks()[0];

  // Combined stream
  const tracks: MediaStreamTrack[] = [videoTrack];
  if (audioTrack) tracks.push(audioTrack);
  const combinedStream = new MediaStream(tracks);

  const mimeType = getSupportedMimeType();
  const recorder = new MediaRecorder(combinedStream, { mimeType });
  const chunks: Blob[] = [];

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.start(100); // collect in 100ms chunks

  const total = slides.length;

  for (let i = 0; i < total; i++) {
    const slide = slides[i];
    onProgress?.(i + 1, total);

    // Draw the slide frame
    drawSlide(ctx, slide, i + 1, total);

    if (slide.audioBlob) {
      // Decode and play audio through AudioContext
      const arrayBuffer = await slide.audioBlob.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      await new Promise<void>((resolve) => {
        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioDest);
        source.onended = () => resolve();
        source.start();
      });
    } else {
      // No audio — hold the slide for 3 seconds
      await new Promise<void>((resolve) => setTimeout(resolve, 3000));
    }
  }

  // Stop recording
  await new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
    recorder.stop();
  });

  // Close audio context
  await audioCtx.close();

  // Build and download the file
  const ext = getFileExtension(mimeType);
  const safeName = title.slice(0, 60).replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const blob = new Blob(chunks, { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}-narrated.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}
