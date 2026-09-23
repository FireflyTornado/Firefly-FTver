---
title: 歌单没有及时更新——由一次 API 异常引发的音乐播放器改造
description: 看文章的时候没歌听怎么行？记录我如何从一次歌单 API 数据异常出发，修正 Firefly 音乐播放器的一些小问题，以及加入我的一些“小巧思”。
published: 2026-09-22
tags: [Firefly, blog, 组件]
category: 技术
---

最近，我给博客的音乐播放器更新了歌单。

原本以为这只是一件很简单的事：在网易云音乐里把新歌曲加入歌单，刷新博客，播放器就应该自动读到最新内容。

但实际情况并不是这样。

无论怎么刷新，播放器里始终看不到新加入的歌曲。也正是从这个看似普通的问题开始，我顺着播放器的数据读取、播放队列和异常处理一路检查，最后干脆把几个一直想改、却没有认真整理过的地方一起完善了。

这篇文章记录的，就是这次播放器改造的完整过程。

---

# 问题并不在浏览器缓存

最开始，我怀疑的是缓存。

毕竟播放器是一个长期存在于页面中的全局组件，又配合 Swup 保持播放状态，很容易让人联想到：是不是旧歌单被保存在了 `localStorage`，或者页面切换以后复用了旧数据？

检查代码后发现，播放器确实会把音量写入 `localStorage`，但歌单本身并不会被持久化。只要完整刷新页面，播放器仍然会重新向 Meting API 请求数据。

在播放器状态中，`localStorage` 只用于恢复音量：

```js title="src/components/features/MusicManager.astro"
volume: localStorage.getItem('music-player-volume') !== null
	? parseFloat(localStorage.getItem('music-player-volume'))
	: (config.volume || 0.7),
```

修改音量时也只会写回这个键，并没有保存播放列表：

```js title="src/components/features/MusicManager.astro"
localStorage.setItem('music-player-volume', val.toString());
```

真正的问题出现在 API 的切换链路上。

当时配置的主 API 已经返回 `404`，播放器于是依次尝试备用接口。第一个能够返回非空数组的备用接口只返回了 3 首歌，而网易云源歌单和其他接口实际返回的是 7 首。

播放器原来的判断逻辑非常直接：

```js title="src/components/features/MusicManager.astro"
if (Array.isArray(data) && data.length > 0) {
	state.playlist = data.map(function (item) {
		return {
			name: item.title || item.name || 'Unknown',
			artist: item.author || item.artist || 'Unknown',
			url: item.url,
			pic: item.pic || item.cover || '',
			lrc: item.lrc
		};
	});
	return;
}
```

只要结果不是空数组，就认为请求成功，并停止尝试后续接口。

所以页面并不是没有重新请求，也不是浏览器偷偷保存了旧歌单，而是每次刷新都会稳定地拿到同一份不完整数据。

这个排查让我重新意识到一件事：第三方音乐 API 的“请求成功”，不一定等于“数据正确”，更不等于“歌曲一定能够播放”。

> [!NOTE]
> 对播放器来说，HTTP 状态正常、返回值也是非空数组，只能说明接口完成了一次响应。歌单是否完整、歌曲地址是否有效，仍然是另外两个问题。

对于歌单数量不一致，最直接的办法确实是每次请求全部 API，再采用歌曲数量最多的结果。但如果把这种行为直接写死，歌单没有更新时也会产生一轮不必要的并行请求。

因此，我没有在这里简单地把“第一个非空结果”替换成“永远请求全部”，而是先把它记成一个需要配置化的问题：既要保留响应更快、请求更少的旧行为，也要允许播放器在必要时比较多个接口。这点会在后文说明。

与此同时，检查实际播放结果还暴露了另一个问题：VIP 歌曲即使能返回名称、歌手和封面，也未必能提供真正可用的音频地址。这也把改造方向从“怎样选一个更完整的 API 歌单”，继续推向了“怎样让 API 歌曲和本地歌曲共存”。

---

# 让 API 歌曲和本地歌曲同时存在

在确认歌单数量异常来自 API 回退链路后，我又碰到了真正促使我加入混合模式的情况：API 无法完整播放歌单里的 VIP 歌曲。

有些 VIP 歌曲能够正常返回名称、歌手和封面，看起来已经成功进入歌单，但真正点击播放时，API 提供的音频地址并不可用。只依赖联网接口，就意味着这些歌曲虽然“看得见”，却始终“听不到”。

播放器原本的类型定义只允许 `meting` 和 `local`：前者完全依赖联网 API，后者则只读取项目里的本地歌曲，两者只能选一个。

```diff lang="ts" title="src/types/musicConfig.ts"
 // 音乐播放器配置
 export type MusicPlayerConfig = {
-	// 使用方式：'meting' 或 'local'
-	mode?: "meting" | "local"; // "meting" 使用 Meting API，"local" 使用本地音乐列表
+	// 使用方式：'meting'、'local' 或 'hybrid'
+	mode?: "meting" | "local" | "hybrid"; // "hybrid" 会将本地歌曲追加到 API 歌单末尾

 	// 默认音量 (0-1)
 	volume?: number;
```

这时我的需求就很明确了：普通歌曲继续由 API 管理，无法通过 API 正常播放的 VIP 歌曲则直接放到博客项目中。

于是我增加了第三种模式，并把博客当前使用的模式切换为 `hybrid`：

```diff lang="ts" title="src/config/musicConfig.ts"
 	// 是否在侧边栏显示音乐播放器组件
 	showInSidebar: true,

-	// 使用方式："meting" 使用 Meting API，"local" 使用本地音乐列表
-	mode: "meting",
+	// 使用方式："meting" 使用 API，"local" 使用本地列表，"hybrid" 同时使用两者
+	mode: "hybrid",

 	// 默认音量 (0-1)
 	volume: 0.7,
```

混合模式会先获取 API 歌单，再把 `local.playlist` 中的歌曲追加到末尾：

```text
API 歌单
   ↓
追加本地歌曲
   ↓
最终播放列表
```

对应的初始化逻辑也多出一个分支：API 成功时合并两份歌单，API 失败时只要还有本地歌曲，就不会让整个初始化过程失败。

```diff lang="js" title="src/components/features/MusicManager.astro"
 		try {
-			if (config.mode === 'meting' && config.meting) {
-				await fetchMetingData();
-			} else if (config.mode === 'local') {
+			if (config.mode === 'meting' && config.meting) {
+				await fetchMetingData();
+			} else if (config.mode === 'hybrid') {
+				try {
+					if (config.meting) await fetchMetingData();
+				} catch (e) {
+					// 混合模式下 API 不可用时，仍允许本地歌曲正常工作。
+					if (config.localPlaylist.length === 0) throw e;
+					console.warn('Meting APIs failed, using local playlist only', e);
+				}
+
+				state.playlist = state.playlist.concat(config.localPlaylist || []);
+			} else if (config.mode === 'local') {
 				state.playlist = config.localPlaylist || [];
 			}

 			if (state.playlist.length > 0) {
```

现阶段没有加入歌曲匹配、覆盖或去重逻辑。本地歌曲就是单纯地追加进去，配置也保持足够直观：

```ts title="src/config/musicConfig.ts"
local: {
	playlist: [
		{
			name: "萤火虫之舞",
			artist: "萤火虫",
			url: "/assets/music/萤火虫之舞.mp3",
			cover: "/assets/music/cover/萤火虫之舞.jpg",
			lrc: "",
		},
	],
},
```

> [!TIP]
> 本地音频、封面和歌词可以放在 `public/assets/music/` 下，并在配置中使用 `/assets/music/...` 路径。这样构建后仍能通过稳定的站内地址访问。

还有一个很重要的细节：如果 API 完全不可用，`hybrid` 模式仍然会继续初始化本地歌单。

这意味着第三方服务故障不会让整个播放器一起消失。至少本地保存的歌曲始终可以播放。

---

# “随机播放”其实不只是随机取一个数字

整理完歌曲来源以后，我又注意到了播放器的随机模式。

原来的实现是每次需要下一首时，直接生成一个随机下标：

```js title="src/components/features/MusicManager.astro"
nextIndex = Math.floor(Math.random() * state.playlist.length);
prevIndex = Math.floor(Math.random() * state.playlist.length);
```

也就是说，“下一首”和“上一首”都只是重新抽取一次。

从数学上看，它当然是随机的，但从听歌体验上看会有几个很明显的问题：

- 当前歌曲可能马上再次出现；
- 有些歌曲短时间内连续出现；
- 有些歌曲可能一直抽不到；
- 点击“上一首”并不会回到刚才播放的歌曲。

真正符合大多数人直觉的随机播放，通常不是“每次重新抽签”，而是先把整个歌单打乱，再按照打乱后的顺序播放。

因此，我没有直接替换旧逻辑，而是把随机策略做成了配置项：

```diff lang="ts" title="src/types/musicConfig.ts"
 	// 播放模式：'list'=列表循环, 'one'=单曲循环, 'random'=随机播放
 	playMode?: "list" | "one" | "random";

+	// 随机策略：'simple'=每次独立随机抽取, 'queue'=打乱队列且一轮内不重复
+	randomMode?: "simple" | "queue";

 	// 是否显示歌词
 	showLyrics?: boolean;
```

其中：

- `simple` 保留原来的独立随机抽取；
- `queue` 使用打乱后的随机队列，一轮内不会重复。

当前博客使用的是：

```diff lang="ts" title="src/config/musicConfig.ts"
 	// 播放模式：'list'=列表循环, 'one'=单曲循环, 'random'=随机播放
 	playMode: "random",

+	// 随机策略：仅随机模式生效，'simple'=每次独立随机抽取, 'queue'=打乱队列且一轮内不重复
+	randomMode: "queue",

	// 是否启用歌词
 	showLyrics: false,
```

队列通过 Fisher–Yates 算法打乱。播放完一轮后再生成新队列，同时排除当前歌曲，避免新一轮开始时立刻重复上一轮最后一首。

```diff lang="js" title="src/components/features/MusicManager.astro"
 	else if (config.playMode === 'one') state.playMode = 1;
 	else state.playMode = 0;

+	// Queue shuffle keeps every track unique within a round and records
+	// actual playback history so Previous can return to the prior track.
+	var randomQueue = [];
+	var randomHistory = [];
+	var randomHistoryStart = 0;
+	var randomHistoryCount = 0;
+
+	function resetRandomState() {
+		randomQueue = [];
+		randomHistory = [];
+		randomHistoryStart = 0;
+		randomHistoryCount = 0;
+	}
+
+	function pushRandomHistory(index) {
+		var limit = state.playlist.length;
+		if (limit === 0) return;
+
+		if (randomHistoryCount < limit) {
+			var insertIndex = (randomHistoryStart + randomHistoryCount) % limit;
+			randomHistory[insertIndex] = index;
+			randomHistoryCount++;
+			return;
+		}
+
+		// Overwrite the oldest entry without shifting the entire array.
+		randomHistory[randomHistoryStart] = index;
+		randomHistoryStart = (randomHistoryStart + 1) % limit;
+	}
+
+	function popRandomHistory() {
+		if (randomHistoryCount === 0) return null;
+
+		var limit = state.playlist.length;
+		var lastIndex = (randomHistoryStart + randomHistoryCount - 1) % limit;
+		var index = randomHistory[lastIndex];
+		randomHistoryCount--;
+
+		if (randomHistoryCount === 0) {
+			randomHistory = [];
+			randomHistoryStart = 0;
+		}
+
+		return index;
+	}
+
+	function refillRandomQueue(excludeIndex) {
+		var indices = [];
+		for (var i = 0; i < state.playlist.length; i++) {
+			if (i !== excludeIndex) indices.push(i);
+		}
+
+		// Fisher-Yates shuffle produces an unbiased random permutation.
+		for (var j = indices.length - 1; j > 0; j--) {
+			var swapIndex = Math.floor(Math.random() * (j + 1));
+			var temp = indices[j];
+			indices[j] = indices[swapIndex];
+			indices[swapIndex] = temp;
+		}
+
+		randomQueue = indices;
+	}
+
+	function getNextQueueIndex() {
+		if (state.playlist.length <= 1) return state.currentIndex;
+		if (randomQueue.length === 0) refillRandomQueue(state.currentIndex);
+		return randomQueue.pop();
+	}

 	// ── Event helpers ────────────────────────────────────────
 	function emit(name, detail) {
```

下一首的逻辑则根据配置选择旧的独立抽取，或新的无重复队列：

```diff lang="js" title="src/components/features/MusicManager.astro"
 		}
 		var nextIndex;
 		if (state.playMode === 2) {
-			nextIndex = Math.floor(Math.random() * state.playlist.length);
+			if (config.randomMode === 'queue') {
+				nextIndex = getNextQueueIndex();
+				if (nextIndex !== state.currentIndex) pushRandomHistory(state.currentIndex);
+			} else {
+				nextIndex = Math.floor(Math.random() * state.playlist.length);
+			}
 		} else {
 			nextIndex = (state.currentIndex + 1) % state.playlist.length;
 		}
 		loadTrack(nextIndex, true);
```

播放器还会记录真实的播放历史。因此在 `queue` 模式下，“上一首”终于拥有了符合直觉的含义：它会返回刚刚听过的歌曲，而不是再随机一次。

> [!TIP]
> 如果更在意“一轮之内每首歌都能听到”，推荐使用 `queue`；如果希望保留完全独立、允许短期重复的随机抽取，则可以继续使用 `simple`。

---

# 大歌单下的随机队列性能

随机队列完成以后，我又想到另一个问题：如果歌单特别大，会不会因为维护这个数组而变慢？

生成随机队列本身是 O(n)，而且每轮只执行一次，通常不是主要问题。真正值得注意的是取出队首时常用的 `shift()`：它需要移动后面的全部元素，如果从头到尾播放一个特别大的队列，累计复杂度可能接近 O(n²)。

因此，我在实现时选择了 `pop()`，而不是看起来更符合“队列”直觉的 `shift()`。歌单下标已经被完整打乱，从开头取和从末尾取并不会影响随机性；但 `pop()` 可以直接移除数组末尾的元素，不需要重新排列其余内容，正好避开了 `shift()` 的额外开销：

```js title="src/components/features/MusicManager.astro"
function getNextQueueIndex() {
	if (state.playlist.length <= 1) return state.currentIndex;
	if (randomQueue.length === 0) refillRandomQueue(state.currentIndex);
	return randomQueue.pop();
}
```

用户点击“上一首”时，当前歌曲也从末尾放回待播队列：

```js title="src/components/features/MusicManager.astro"
if (config.randomMode === 'queue') {
	if (randomHistoryCount === 0) {
		audio.currentTime = 0;
		return;
	}
	prevIndex = popRandomHistory();
	randomQueue.push(state.currentIndex);
}
```

这样每次取歌和重新入队都变成了 O(1)。

播放历史则使用上文 diff 中的固定容量环形缓冲区，上限始终等于当前歌单长度。历史达到上限后，新记录会直接覆盖最旧记录，不会无限增长，也不需要为了删除第一项而移动整个数组。

对于普通的小歌单，这种优化几乎感觉不到差别；但既然随机队列本身很容易写成稳定的线性方案，就没有必要留下一个会随歌曲数量放大的隐患。

---

# API 请求方式也应该由配置决定

这里回到了文章开头暂时留下的问题：当多个 API 返回的歌单数量不一致时，播放器究竟应该优先速度，还是优先完整性？

要回答它，其实需要拆开两个维度：第一是“允许请求哪些接口”，第二是“拿到多个有效结果后选择哪一个”。播放器原来会固定按照“主 API → 备用 API”的顺序请求，这种方式容错能力不错，但并不适合所有部署环境。

有时我只想使用自己信任的一个接口；有时则希望某个接口失效后自动切换。于是我把请求方式也加入了配置：

```diff lang="ts" title="src/types/musicConfig.ts"
 	meting?: {
 		// Meting API 地址
 		api?: string;

+		// API 请求方式：'sequential'=依次尝试主接口和备用接口, 'single'=仅使用主接口
+		requestMode?: "sequential" | "single";
+
+		// 多 API 歌单选择：'first'=首个有效结果, 'largest'=并行请求并选择歌曲最多的结果
+		apiSelectionMode?: "first" | "largest";
+
+		// 每个 API 请求的超时时间（毫秒）
+		timeoutMs?: number;

 		// 音乐平台：netease=网易云音乐, tencent=QQ音乐, kugou=酷狗音乐, xiami=虾米音乐, baidu=百度音乐
 		server?: "netease" | "tencent" | "kugou" | "xiami" | "baidu";
```

两种模式的行为分别是：

| 模式 | 行为 |
|---|---|
| `sequential` | 依次尝试主 API 和 `fallbackApis` |
| `single` | 只请求主 API，不尝试备用歌单接口 |

`requestMode` 解决了第一个维度，但允许使用多个 API 以后，第二个问题仍然存在：应该采用哪一个接口返回的歌单？

如果仍然沿用“遇到第一个非空数组就停止”的判断，就会再次落回文章开头的情况：源歌单有 7 首，播放器却因为先收到一份有效但不完整的响应，最终只拿到 3 首。

`first` 模式保留的正是这段提前返回逻辑：

```js title="src/components/features/MusicManager.astro"
for (var i = 0; i < apis.length; i++) {
	var baseApi = apis[i];
	try {
		var data = await fetchPlaylistFromApi(baseApi, m, timeoutMs);
		applyMetingPlaylist(data);
		return;
	} catch (e) {
		if (e && e.isTimeout) hasTimeout = true;
		console.warn('Meting API failed for ' + baseApi, e);
	}
}
```

因此，我又增加了上面类型定义中与 `requestMode` 并列的 `apiSelectionMode`，让“请求范围”和“结果选择”保持相互独立：

| 策略 | 行为 |
|---|---|
| `first` | 按配置顺序请求，使用第一个有效结果并立即停止 |
| `largest` | 并行请求全部可用接口，采用歌曲数量最多的结果 |

`first` 适合歌单相对稳定、希望减少请求和等待时间的情况；`largest` 则更适合刚更新过歌单，或者不同第三方接口经常出现数据不同步的情况。

这两个配置最终会先决定候选接口，再决定串行提前返回，还是并行比较结果：

```diff lang="js" title="src/components/features/MusicManager.astro"
 	async function fetchMetingData() {
 		if (!config.meting) return;
 		var m = config.meting;
-		var apis = [m.api].concat(m.fallbackApis || []);
+		var apis = m.requestMode === 'single'
+			? [m.api]
+			: [m.api].concat(m.fallbackApis || []);
+		var timeoutMs = Number(m.timeoutMs);
+		if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) timeoutMs = 8000;
+		var hasTimeout = false;
+		apis = apis.filter(function (api) { return !!api; });
+
+		if (m.apiSelectionMode === 'largest' && apis.length > 1) {
+			var results = await Promise.allSettled(apis.map(function (baseApi) {
+				return fetchPlaylistFromApi(baseApi, m, timeoutMs);
+			}));
+			var largestPlaylist = null;
+
+			results.forEach(function (result, index) {
+				if (result.status === 'fulfilled') {
+					if (!largestPlaylist || result.value.length > largestPlaylist.length) {
+						largestPlaylist = result.value;
+					}
+					return;
+				}
+
+				if (result.reason && result.reason.isTimeout) hasTimeout = true;
+				console.warn('Meting API failed for ' + apis[index], result.reason);
+			});
+
+			if (largestPlaylist) {
+				applyMetingPlaylist(largestPlaylist);
+				return;
+			}
+			throw createMetingFetchError(hasTimeout);
+		}

 		for (var i = 0; i < apis.length; i++) {
 			var baseApi = apis[i];
```

> [!TIP]
> `requestMode: "single"` 时只存在一个候选 API，因此两种选择策略的结果相同，也不会额外产生请求。只有在 `sequential` 配置了多个接口时，`largest` 才会请求并比较全部结果。

同时，上面一并加入的 `timeoutMs` 可以单独控制每个 API 请求的超时时间。在实际配置中，这三个选项紧跟在主 API 地址之后：

```diff lang="ts" title="src/config/musicConfig.ts"
 		// 默认使用官方 API，也可以使用自定义 API
 		api: "https://api.moeyao.cn/meting/?server=:server&type=:type&id=:id",
+		// API 请求方式："sequential" 依次尝试主接口和备用接口，"single" 仅使用主接口
+		requestMode: "sequential",
+		// 多 API 歌单选择：仅在 sequential 模式生效。"first" 使用首个有效结果，"largest" 请求全部并选择歌曲最多的结果
+		apiSelectionMode: "first",
+		// 每个 API 请求的超时时间（毫秒）
+		timeoutMs: 10000,
 		// 音乐平台：netease=网易云音乐, tencent=QQ音乐, kugou=酷狗音乐, xiami=虾米音乐, baidu=百度音乐
 		server: "netease",
```

超时范围不仅包括建立连接，也包括接收响应正文和解析 JSON。这样可以避免服务器只返回响应头、正文却迟迟不结束时，播放器仍然无限等待。

这里没有使用只包住 `fetch()` 的计时，而是让同一个 `AbortController` 一直覆盖到 `res.json()` 完成：

```diff lang="js" title="src/components/features/MusicManager.astro"
 	// ── Meting fetch ─────────────────────────────────────────
+	async function fetchMetingJson(fetchUrl, timeoutMs) {
+		var controller = new AbortController();
+		var timeoutId = setTimeout(function () {
+			controller.abort();
+		}, timeoutMs);
+
+		try {
+			var res = await fetch(fetchUrl, { signal: controller.signal });
+			if (!res.ok) throw new Error('HTTP ' + res.status);
+			return await res.json();
+		} catch (e) {
+			if (controller.signal.aborted) {
+				var timeoutError = new Error('Meting API request timed out');
+				timeoutError.isTimeout = true;
+				throw timeoutError;
+			}
+			throw e;
+		} finally {
+			clearTimeout(timeoutId);
+		}
+	}
+
+	async function fetchPlaylistFromApi(baseApi, m, timeoutMs) {
+		var fetchUrl = baseApi
+			.replace(':server', m.server)
+			.replace(':type', m.type)
+			.replace(':id', m.id)
+			.replace(':r', Math.random());
+		if (m.auth) fetchUrl += '&auth=' + m.auth;
+
+		var data = await fetchMetingJson(fetchUrl, timeoutMs);
+		if (!Array.isArray(data) || data.length === 0) {
+			throw new Error('Meting API returned an empty playlist');
+		}
+		return data;
+	}
```

> [!NOTE]
> `timeoutMs` 是单个 API 请求的超时时间。`first` 会依次等待各个接口，因此总等待时间可能高于这个值；`largest` 会并行请求全部接口，整体等待时间通常接近一次超时周期，但会产生更多请求。

> [!IMPORTANT]
> `requestMode` 只控制“获取歌单”时使用几个 API。歌曲进入播放列表后，如果具体音频地址播放失败，播放器原有的备用音频地址切换逻辑仍然独立工作。因此，`single` 当前表示“只用一个 API 获取歌单”，歌曲获取失败依旧会尝试其它 API。

具体来说，加载歌曲时仍会根据歌曲 ID 为当前曲目准备备用播放地址；这段逻辑不读取 `requestMode`：

```js title="src/components/features/MusicManager.astro"
if (matchId && matchServer && config.meting && config.meting.fallbackApis) {
	config.meting.fallbackApis.forEach(function (fallback) {
		var fallbackUrl = fallback
			.replace(':server', matchServer[1])
			.replace(':type', 'url')
			.replace(':id', matchId[1]);
		if (currentTrackUrls.indexOf(fallbackUrl) === -1) {
			currentTrackUrls.push(fallbackUrl);
		}
	});
}
```

---

# 纯 API 模式超时后可以手动重试

如果使用纯 `meting` 模式，默认便不会读取本地歌曲了。那么请求超时以后，只显示一句“播放器错误”显然不够友好。

现在，当允许使用的接口没有成功返回，并且请求链路中发生了超时时，播放器面板会显示：

```text
歌单请求超时

[重新获取]
```

点击按钮后，播放器会重新执行完整的歌单请求流程。导航栏和侧边栏中的播放器共用同一个管理器，因此加载和重试状态也会同步。

管理器会把“是否可重试”作为状态的一部分发给界面，并允许强制重新初始化：

```diff lang="js" title="src/components/features/MusicManager.astro"
 		} catch (e) {
 			console.error('Music Manager init error:', e);
+			var isTimeout = !!(e && e.isTimeout);
+			var errorMessage = isTimeout ? config.i18n.timeout : config.i18n.error;
+			state.error = errorMessage;
+			state.errorRetryable = config.mode === 'meting' && isTimeout;
 			state.initialized = true;
 			emit('fm:init', {
 				playlist: [],
 				playMode: state.playMode,
 				volume: state.volume,
 				isMuted: state.isMuted
 			});
-			emit('fm:error', { message: config.i18n.error });
+			emit('fm:error', {
+				message: errorMessage,
+				retryable: state.errorRetryable,
+				reason: isTimeout ? 'timeout' : 'error'
+			});
 		} finally {
 			state.initializing = false;
 		}
```

```diff lang="js" title="src/components/features/MusicManager.astro"
 	// ── Public API ───────────────────────────────────────────
 	window.__fireflyMusic = {
 		init: init,
+		retry: function () { return init(true); },
 		getState: function () {
 			var track = state.playlist[state.currentIndex] || null;
```

播放器面板收到可重试错误后，不再只替换标题，而是显示重试区域：

```diff lang="js" title="src/components/features/MusicPlayerView.astro"
 		on('fm:lrc-index', function (e) {
 			updateLrcHighlight(e.detail.index);
 		});

 		on('fm:error', function (e) {
+			if (e.detail.retryable) {
+				showRetry(e.detail.message);
+				return;
+			}
 			ui.title.innerText = e.detail.message || cfg.i18n.error;
 		});

 		// ── Button click delegates ───────────────────────────────
 		ui.btnPlay.addEventListener('click', function () { mgr.togglePlay(); });
 		ui.btnNext.addEventListener('click', function () { mgr.playNext(); });
 		ui.btnPrev.addEventListener('click', function () { mgr.playPrev(); });
 		ui.btnRepeat.addEventListener('click', function () { mgr.cyclePlayMode(); });
 		ui.btnMute.addEventListener('click', function () { mgr.toggleMute(); });
+		ui.btnRetry.addEventListener('click', function () { mgr.retry(); });

 		ui.volContainer.addEventListener('click', function (e) {
```

在 `hybrid` 模式下，处理方式则不同。API 超时不会弹出一个阻塞整个播放器的错误面板，而是直接读取本地歌曲播放，不再请求 API。

这两种行为分别对应了两种不同的事实：

- `meting` 超时以后确实没有歌曲可播，需要用户重试；
- `hybrid` 即使联网失败，本地歌曲仍然是有效内容，不应该被错误面板挡住。

这里之所以只在纯 API 模式开放重试，也是由这一行判断直接决定的：

```js title="src/components/features/MusicManager.astro"
state.errorRetryable = config.mode === 'meting' && isTimeout;
```

---

# 快速切歌时，新歌词可能被旧歌词替换

最后一个修复与歌词有关。

播放器加载在线歌词时使用异步请求。如果连续快速切换歌曲，可能出现这样的顺序：

```text
开始请求歌曲 A 的歌词
切换到歌曲 B
开始请求歌曲 B 的歌词
歌曲 B 的歌词先返回
歌曲 A 的歌词后返回
```

如果没有额外保护，最后返回的 A 歌词会覆盖当前正在播放的 B。

现在，每次切歌都会取消上一首尚未完成的歌词请求，并增加一个歌词加载版本号：

```text
切换歌曲
  ├─ AbortController 取消旧请求
  └─ lyricsLoadVersion + 1
```

歌词响应返回时，还要再次确认自己的版本号仍然属于当前歌曲。只有两个条件都满足，结果才允许写入播放器状态。

同时，歌词请求现在也会检查 HTTP 状态。服务端返回错误页面时，不会再把错误正文当成正常歌词处理。

对应的修改集中在同一条异步链路中。首先，在歌词函数前保存当前请求及版本，并在每次加载开始时让旧请求失效：

```diff lang="js" title="src/components/features/MusicManager.astro"
 	// ── Lyrics ───────────────────────────────────────────────
+	var lyricsLoadVersion = 0;
+	var lyricsController = null;
+
 	function loadLyrics(track) {
+		var version = ++lyricsLoadVersion;
+		if (lyricsController) {
+			lyricsController.abort();
+			lyricsController = null;
+		}
 		state.lyrics = [];
 		state.currentLrcIndex = -1;

 		if (!track.lrc) {
```

真正发起网络请求时，再把控制器交给 `fetch()`，并在写入状态前核对版本：

```diff lang="js" title="src/components/features/MusicManager.astro"
 		if (isLrcUrl) {
+			lyricsController = new AbortController();
+			var controller = lyricsController;
 			emit('fm:lyrics', { lyrics: [], status: 'loading' });
-			fetch(track.lrc)
-				.then(function (r) { return r.text(); })
+			fetch(track.lrc, { signal: controller.signal })
+				.then(function (r) {
+					if (!r.ok) throw new Error('HTTP ' + r.status);
+					return r.text();
+				})
 				.then(function (text) {
+					if (version !== lyricsLoadVersion) return;
 					state.lyrics = parseLRC(text);
 					emit('fm:lyrics', { lyrics: state.lyrics, status: 'loaded' });
 				})
-				.catch(function () {
+				.catch(function (e) {
+					if (version !== lyricsLoadVersion || (e && e.name === 'AbortError')) return;
 					state.lyrics = [];
 					emit('fm:lyrics', { lyrics: [], status: 'failed' });
+				})
+				.finally(function () {
+					if (version === lyricsLoadVersion) lyricsController = null;
 				});
 		} else {
 			state.lyrics = parseLRC(track.lrc);
```

---

# 最终配置

经过这次调整，可以按照下面的结构配置播放器。这里使用的 API 地址、歌单 ID 和歌曲信息都只是占位示例，需要根据自己的环境替换：

```ts title="src/config/musicConfig.ts（示例）"
export const musicPlayerConfig: MusicPlayerConfig = {
	showInNavbar: true,
	showInSidebar: true,
	mode: "hybrid",
	volume: 0.7,
	playMode: "random",
	randomMode: "queue",
	showLyrics: false,

	meting: {
		api: "https://music-api.example.com/meting?server=:server&type=:type&id=:id",
		requestMode: "sequential",
		apiSelectionMode: "first",
		timeoutMs: 10000,
		server: "netease",
		type: "playlist",
		id: "你的歌单 ID",
		auth: "",
		fallbackApis: [
			"https://backup-api.example.com/meting?server=:server&type=:type&id=:id",
		],
	},

	local: {
		playlist: [
			{
				name: "本地歌曲",
				artist: "歌手名称",
				url: "/assets/music/song.mp3",
				cover: "/assets/music/cover/song.webp",
				lrc: "/assets/music/lrc/song.lrc",
			},
		],
	},
};
```

这些配置彼此独立：

- `mode` 决定歌曲来自 API、本地，还是两者同时使用；
- `playMode` 决定列表循环、单曲循环或随机播放；
- `randomMode` 决定随机播放是独立抽取还是无重复队列；
- `requestMode` 决定歌单 API 是否允许依次回退；
- `apiSelectionMode` 决定采用第一个有效歌单，还是比较所有接口后选择歌曲最多的结果；
- `timeoutMs` 决定每个歌单请求最多等待多久。

---

# 结语

这次修改最初只是因为“新加的歌曲为什么没有出现”。

但真正沿着数据链路检查以后，我发现播放器的问题并不只在某一个失效的接口上。歌曲来源、API 容错、随机队列、播放历史、超时反馈和异步竞态，其实都属于同一件事：播放器应该如何在外部数据并不可靠的情况下，仍然维持一个可预测的状态。

现在的实现依然不是什么复杂的专业音乐系统，也没有加入歌曲指纹、VIP 歌曲自动匹配或个性化推荐。但它已经比最初那个“拿到数组就直接播放”的组件稳定了许多：

- API 和本地歌曲可以共存；
- 第三方服务失效时，本地歌曲仍然可用；
- 随机播放一轮内不会重复；
- 大歌单不会因为数组头部操作逐渐变慢；
- 多个歌单 API 可以优先响应速度，也可以比较后选择歌曲最多的结果；
- API 请求不会无限等待；
- 纯 API 模式可以手动重试；
- 快速切歌不会再串歌词。

有时候，一个小问题最有价值的部分并不是把它临时修好，而是借着它重新看清整条链路。在修正现有问题的同时，顺便也可以实现一些新的想法。
