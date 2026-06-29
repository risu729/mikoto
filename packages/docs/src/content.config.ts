import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { defineCollection } from "astro:content";

// oxlint-disable-next-line import/prefer-default-export -- Astro requires this named export.
export const collections = {
	docs: defineCollection({
		loader: docsLoader(),
		schema: docsSchema(),
	}),
};
