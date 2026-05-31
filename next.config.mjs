/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
    // msedge-tts uses the 'ws' package which has a native C++ addon (bufferutil)
    // for WebSocket frame masking that breaks when bundled — keep as external Node modules
    serverComponentsExternalPackages: ['msedge-tts', 'ws', 'pdf-parse', 'mammoth'],
  },
};

export default nextConfig;
