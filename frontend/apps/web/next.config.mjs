/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@workspace/ui"],
  async rewrites() {
    const rules = [
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/api/:path*",
      },
    ]
    // Docusaurus dev: `bun run start` in docs-site (port 3001, baseUrl /docs/).
    // App: http://localhost:3000/docs → proxied to the docs server.
    if (process.env.NODE_ENV === "development") {
      const docsPort = process.env.DOCS_DEV_PORT ?? "3001"
      const docsOrigin = `http://127.0.0.1:${docsPort}`
      rules.push(
        { source: "/docs", destination: `${docsOrigin}/docs` },
        { source: "/docs/:path*", destination: `${docsOrigin}/docs/:path*` },
      )
    }
    return rules
  },
}

export default nextConfig
