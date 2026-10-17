/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: { "/api/ask": ["./data/records.json", "./data/embeddings.json"] },
};
export default nextConfig;
