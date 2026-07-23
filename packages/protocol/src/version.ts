declare const MIKOTO_BUILD_VERSION: string;

const MIKOTO_VERSION =
	typeof MIKOTO_BUILD_VERSION === "undefined" ? "0.0.0-development" : MIKOTO_BUILD_VERSION;

export default MIKOTO_VERSION;
