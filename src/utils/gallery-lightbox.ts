export type GalleryLightboxImage = string | { src: string; type?: string };
type FancyboxStatic = typeof import("@fancyapps/ui").Fancybox;
type GalleryLightboxOptions = {
	Thumbs: {
		autoStart: boolean;
		showOnStart: "yes";
	};
	Toolbar: {
		display: {
			left: string[];
			middle: string[];
			right: string[];
		};
	};
	animated: boolean;
	dragToClose: boolean;
	keyboard: {
		Escape: "close";
		Delete: "close";
		Backspace: "close";
		PageUp: "next";
		PageDown: "prev";
		ArrowUp: "next";
		ArrowDown: "prev";
		ArrowRight: "next";
		ArrowLeft: "prev";
	};
	fitToView: boolean;
	preload: number;
	infinite: boolean;
	Panzoom: {
		maxScale: number;
		minScale: number;
	};
	caption: boolean;
};

export function getGalleryLightboxOptions(): GalleryLightboxOptions {
	return {
		Thumbs: {
			autoStart: true,
			showOnStart: "yes",
		},
		Toolbar: {
			display: {
				left: ["infobar"],
				middle: [
					"zoomIn",
					"zoomOut",
					"toggle1to1",
					"rotateCCW",
					"rotateCW",
					"flipX",
					"flipY",
				],
				right: ["slideshow", "thumbs", "close"],
			},
		},
		animated: true,
		dragToClose: true,
		keyboard: {
			Escape: "close",
			Delete: "close",
			Backspace: "close",
			PageUp: "next",
			PageDown: "prev",
			ArrowUp: "next",
			ArrowDown: "prev",
			ArrowRight: "next",
			ArrowLeft: "prev",
		},
		fitToView: true,
		preload: 3,
		infinite: true,
		Panzoom: {
			maxScale: 3,
			minScale: 1,
		},
		caption: false,
	};
}

export function showGalleryLightbox(
	Fancybox: FancyboxStatic,
	images: GalleryLightboxImage[],
	initialIndex = 0,
): ReturnType<FancyboxStatic["show"]> | null {
	const slides = images
		.map((image) =>
			typeof image === "string" ? { src: image, type: "image" } : image,
		)
		.filter((image) => image.src);
	if (slides.length === 0) return null;
	const startIndex =
		((Math.trunc(initialIndex) % slides.length) + slides.length) %
		slides.length;
	return Fancybox.show(
		slides as NonNullable<Parameters<FancyboxStatic["show"]>[0]>,
		{
			...getGalleryLightboxOptions(),
			startIndex,
		} as Parameters<FancyboxStatic["show"]>[1],
	);
}
