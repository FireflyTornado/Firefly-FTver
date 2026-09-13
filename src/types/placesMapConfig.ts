export interface PlacesMapConfig {
	/** 高德地图 Web 端 JS API Key，用于加载 AMap JS API。 */
	amapKey: string;
	/** 高德地图安全密钥，用于配置 AMap JS API 的 securityJsCode。 */
	amapSecurityJsCode: string;
	/** 是否启用 Places 行政区边界查询和 Polygon 区域填色。 */
	areaHighlight: boolean;
	/** DistrictSearch.search() 真实请求之间的最小间隔，单位为毫秒。 */
	districtQueryInterval: number;
	/** 是否允许在行政区字段全部为空时通过坐标调用逆地理编码。 */
	reverseGeocode: boolean;
	/** 站点主人位置，用于 Overview 地图中的初始定位和标记点。 */
	ownerLocation: {
		lng: number;
		lat: number;
		label: string;
	};
}
