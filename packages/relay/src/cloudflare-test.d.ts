declare module "cloudflare:test" {
	const SELF: Fetcher;
	const reset: () => Promise<void>;

	export { reset, SELF };
}
