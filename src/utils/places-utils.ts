export interface PlaceLocation {
	name: string;
	province?: string;
	city?: string;
	district?: string;
	lng: number;
	lat: number;
	description?: string;
	images: string[];
	exact?: boolean;
	date?: Date;
}

export interface TripRecord {
	id: string;
	title: string;
	date: Date;
	endDate?: Date;
	category?: string;
	tags: string[];
	description?: string;
	locations: PlaceLocation[];
	source: "manual" | "timeline";
	timelineId?: string;
	link?: string;
}

export interface ClientPlaceLocation extends Omit<PlaceLocation, "date"> {
	rawLng: number;
	rawLat: number;
	date: string;
}

export interface ClientTrip {
	id: string;
	title: string;
	description: string;
	date: string;
	endDate: string;
	years: number[];
	category: string;
	tags: string[];
	locations: ClientPlaceLocation[];
	source: "manual" | "timeline";
	link: string;
}

type ContentTrip = {
	id?: string;
	title?: string;
	date: Date;
	endDate?: Date;
	category?: string;
	tags?: string[];
	description?: string;
	locations?: Array<{
		name: string;
		province?: string;
		city?: string;
		district?: string;
		lng: number;
		lat: number;
		description?: string;
		images?: string[];
		exact?: boolean;
		date?: Date;
	}>;
	source?: "manual" | "timeline";
	timelineId?: string;
	link?: string;
	/** 旧版单地点字段，仅用于过渡期兼容。 */
	province?: string;
	city?: string;
	district?: string;
	experience?: string;
	lat?: number;
	lng?: number;
};

/** 未手写 category 时，按旅行描述粗分类，供地图筛选使用。 */
export function inferTripCategory(trip: {
	description?: string;
	experience?: string;
	timelineId?: string;
	category?: string;
}): string {
	if (trip.category?.trim()) return trip.category.trim();
	const text = `${trip.description || trip.experience || ""} ${trip.timelineId || ""}`;
	if (/小学|中学|高中|学院|大学|学校|完小|教育|education|school/.test(text)) {
		return "学校";
	}
	if (
		/开发|工程师|科技|工地|实习|事业部|技术中心|后端|服务器|Blued|贝塔|纸贵/.test(
			text,
		)
	) {
		return "工作";
	}
	return "旅游";
}

function resolveLegacyCoords(place: {
	lat?: number;
	lng?: number;
}): { lng: number; lat: number; exact: boolean } | null {
	if (
		typeof place.lat === "number" &&
		typeof place.lng === "number" &&
		Number.isFinite(place.lat) &&
		Number.isFinite(place.lng)
	) {
		return { lng: place.lng, lat: place.lat, exact: true };
	}
	return null;
}

/**
 * 将 Content Collection 数据归一化为 TripRecord。
 * 新数据直接使用 locations；旧版顶层地点字段会临时转换为单元素 locations。
 */
export function tripsFromContent(entries: ContentTrip[]): TripRecord[] {
	return entries.map((trip, index) => {
		const declaredLocations: PlaceLocation[] = (trip.locations || []).map(
			(location) => ({
				...location,
				province: location.province?.trim() || undefined,
				city: location.city?.trim() || undefined,
				district: location.district?.trim() || undefined,
				description: location.description?.trim() || undefined,
				images: (location.images || []).filter(Boolean),
				exact: location.exact ?? true,
			}),
		);
		const legacyProvince = trip.province || "";
		const legacyCity = trip.city || "";
		const legacyCoords = resolveLegacyCoords({
			lat: trip.lat,
			lng: trip.lng,
		});
		const legacyLocations: PlaceLocation[] =
			declaredLocations.length === 0 && legacyCoords
				? [
						{
							name:
								trip.experience?.trim() ||
								trip.district?.trim() ||
								legacyCity ||
								legacyProvince,
							province: legacyProvince,
							city: legacyCity,
							district: trip.district?.trim() || undefined,
							lng: legacyCoords.lng,
							lat: legacyCoords.lat,
							description: trip.experience?.trim() || undefined,
							images: [],
							exact: legacyCoords.exact,
						},
					]
				: [];
		const locations =
			declaredLocations.length > 0 ? declaredLocations : legacyLocations;
		const primaryLocation = locations[0];
		const description = trip.description?.trim() || trip.experience?.trim();
		const fallbackTitle = primaryLocation?.name || "";

		return {
			id: trip.id || `trip-${index}`,
			title:
				trip.title?.trim() ||
				description ||
				fallbackTitle ||
				`Trip ${index + 1}`,
			date: trip.date,
			endDate: trip.endDate,
			category: inferTripCategory(trip),
			tags: (trip.tags || []).map((tag) => tag.trim()).filter(Boolean),
			description,
			locations,
			source: trip.source || "manual",
			timelineId: trip.timelineId,
			link: trip.link?.trim() || undefined,
		};
	});
}

export function getTripYears(trips: TripRecord[]): number[] {
	const years = new Set<number>();
	for (const trip of trips) {
		years.add(trip.date.getFullYear());
		if (trip.endDate) years.add(trip.endDate.getFullYear());
	}
	return [...years].sort((a, b) => b - a);
}

export function getTripCategories(trips: TripRecord[]): string[] {
	const set = new Set<string>();
	for (const trip of trips) {
		if (trip.category) set.add(trip.category);
	}
	const preferred = ["学校", "工作", "旅游"];
	const rest = [...set]
		.filter((category) => !preferred.includes(category))
		.sort();
	return [...preferred.filter((category) => set.has(category)), ...rest];
}

export function getTripYearKeys(trip: TripRecord): number[] {
	const start = trip.date.getFullYear();
	const end = trip.endDate?.getFullYear() ?? start;
	const keys: number[] = [];
	for (let year = start; year <= end; year++) keys.push(year);
	return keys;
}

export function formatTripDateRange(trip: TripRecord): string {
	const start = trip.date.toISOString().slice(0, 10);
	if (trip.endDate) {
		return `${start} — ${trip.endDate.toISOString().slice(0, 10)}`;
	}
	return start;
}

export function tripToClient(trip: TripRecord, index = 0): ClientTrip {
	const locations = trip.locations.map((location, locationIndex) => {
		// 城市回退坐标做较大偏移；精确地点只做约 10~20m 的偏移以避免完全重叠。
		const step = location.exact === false ? 0.012 : 0.00015;
		const pointIndex = index * 11 + locationIndex;
		return {
			...location,
			rawLng: location.lng,
			rawLat: location.lat,
			date: location.date ? location.date.toISOString().slice(0, 10) : "",
			lng: location.lng + ((pointIndex % 7) - 3) * step,
			lat: location.lat + ((Math.floor(pointIndex / 7) % 7) - 3) * step * 0.85,
		};
	});

	return {
		id: trip.id,
		title: trip.title,
		description: trip.description || "",
		date: trip.date.toISOString().slice(0, 10),
		endDate: trip.endDate ? trip.endDate.toISOString().slice(0, 10) : "",
		years: getTripYearKeys(trip),
		category: trip.category || "",
		tags: trip.tags,
		locations,
		source: trip.source,
		link: trip.link || "",
	};
}
