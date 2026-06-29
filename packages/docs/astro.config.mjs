import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

export default defineConfig({
	integrations: [
		starlight({
			sidebar: [
				{
					items: [
						{ label: "Overview", slug: "" },
						{ label: "Getting Started", slug: "getting-started" },
						{ label: "Architecture", slug: "architecture" },
						{ label: "Configuration", slug: "configuration" },
						{ label: "Local Development", slug: "local-development" },
						{ label: "Deployment Notes", slug: "deployment-notes" },
					],
					label: "Guides",
				},
			],
			title: "mikoto",
		}),
	],
});
