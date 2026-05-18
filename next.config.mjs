/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  // msedge-tts uses the 'ws' package which has native C++ addons that break
  // when bundled by webpack — keep them as external Node modules
  serverExternalPackages: ['msedge-tts', 'ws'],
};

export default nextConfig;
