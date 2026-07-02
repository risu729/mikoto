import { unified } from "@astrojs/markdown-remark";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import rehypeMermaid from "rehype-mermaid";

export default defineConfig({
	integrations: [
		starlight({
			customCss: ["./src/styles/custom.css"],
			sidebar: [
				{
					items: [
						{ label: "Overview", slug: "" },
						{ label: "Motivation", slug: "motivation" },
						{ label: "Architecture", slug: "architecture" },
						{ label: "Configuration", slug: "configuration" },
					],
					label: "Guides",
				},
				{
					items: [{ label: "Cloudflare", slug: "setup/cloudflare" }],
					label: "Setup",
				},
				{
					items: [
						{ label: "Relay", slug: "parts/relay" },
						{ label: "Bridge", slug: "parts/bridge" },
						{ label: "Codex MCP", slug: "parts/codex-mcp" },
					],
					label: "Parts",
				},
				{
					items: [
						{ label: "Deployment", slug: "operations/deployment" },
						{ label: "Security", slug: "operations/security" },
						{ label: "Limitations", slug: "operations/limitations" },
					],
					label: "Operations",
				},
			],
			title: "mikoto",
		}),
	],
	markdown: {
		processor: unified({
			rehypePlugins: [[rehypeMermaid, { dark: true, strategy: "img-svg" }]],
		}),
	},
});
