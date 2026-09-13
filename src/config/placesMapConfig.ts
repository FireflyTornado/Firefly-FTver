import type { PlacesMapConfig } from "@/types/placesMapConfig";

export const placesMapConfig: PlacesMapConfig = {
	// 高德地图 Web 端 JS API Key，用于加载 AMap JS API。
	amapKey: "090e501aa2cd417e078dfada6a95db07",
	// 高德地图安全密钥，用于配置 AMap JS API 的 securityJsCode。
	amapSecurityJsCode: "2fabc347f23c1a8466d83f3f5027ac44",
	// 是否启用 Places 行政区边界查询和区域填色：
	// true：根据 Location 的 province / city / district 调用 AMap.DistrictSearch，
	//       查询行政区边界并绘制 Polygon。
	// false：完全关闭行政区边界查询和区域填色，不产生 DistrictSearch API 请求；
	//        Marker、Trip、Location、Popup 等其它功能不受影响。
	areaHighlight: false,
	// 任意连续两次真正发出的 DistrictSearch.search() 之间的最小间隔，单位为毫秒。
	// 用于限制行政区查询 QPS；QPS=3 时理论最小间隔约 333ms，建议设置为 400ms 或更高。
	// 命中 boundary cache 时不产生 API 请求，也不等待此间隔。
	// 设置为 0 表示不增加额外间隔，但串行查询队列仍然保留。
	districtQueryInterval: 400,
	// 仅在 province / city / district 三者全部为空时，才允许通过 lng / lat 调用逆地理编码。
	// 已填写任意行政区字段时不得调用；此配置与 areaHighlight 相互独立。
	// 开启后可能产生额外的高德逆地理编码 API 调用。
	reverseGeocode: false,
	// 站点主人位置（地图初始中心和标记点）。
	ownerLocation: {
		lng: 117.3,
		lat: 30.5,
		label: "我",
	},
};
