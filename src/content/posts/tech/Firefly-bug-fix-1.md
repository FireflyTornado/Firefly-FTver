---
title: Firefly bug修复：由 localStorage 引发的配置失效bug
published: 2026-09-11
pinned: false
description: 记录 Firefly 全屏壁纸 Hero 布局被旧 localStorage 值覆盖的问题，以及从配置读取链路入手定位并修复问题的过程。。
tags: [Firefly, bug排查, 前端开发]
category: 技术
---

> [!NOTE]
> 本文记录的修复已通过 [PR #632](https://github.com/CuteLeaf/Firefly/pull/632) 提交至 Firefly 项目，并已由原作者合并。

今天在调整 Firefly 博客的全屏壁纸时，遇到了一个有些奇怪的问题。

我在 `backgroundWallpaper.ts` 中将壁纸模式设置为 `fullscreen`，同时把全屏布局设置为 `hero`：

```ts title="src/config/backgroundWallpaper.ts"
export const backgroundWallpaper: BackgroundWallpaperConfig = {
	mode: "fullscreen",

	fullscreen: {
		layout: "hero",
		position: "center",
	},
};
```

按照配置说明，`hero` 应该在主页呈现全屏壁纸；向下滚动屏幕，下方内容出现的同时壁纸变成模糊背景。

然而刷新页面后，实际效果仍然像 `classic` 布局。配置本身没有类型错误，项目也能正常运行，但页面就是没有按照预期切换到 Hero 模式。

这让我开始怀疑：问题可能不在配置文件，而在配置被读取之后的某个环节。

# 从配置读取链路开始排查

一开始，我没有逐一翻阅项目中的所有文件，而是只搜索了几个与问题直接相关的关键词：

```text
backgroundWallpaper
fullscreenLayout
data-fullscreen-layout
hero
localStorage
```

这样很快将范围缩小到了几个文件：

```text
src/config/backgroundWallpaper.ts
src/layouts/Layout.astro
src/utils/setting-utils.ts
src/styles/layout-base.css
src/styles/layout-styles.css
src/components/controls/DisplaySettingsIntegrated.svelte
```

我首先确认了配置类型。`FullscreenWallpaperLayout` 的定义确实包含 `hero`：

```ts title="src/types/backgroundWallpaper.ts"
export type FullscreenWallpaperLayout = "classic" | "hero";
```

这说明 `hero` 是项目正式支持的布局，并不是配置名称写错了。

接着，我检查了负责 Hero 布局的样式。项目会根据 HTML 元素上的两个属性决定最终布局：

```html
<html
	data-wallpaper-mode="fullscreen"
	data-fullscreen-layout="hero"
>
```

当这两个属性同时满足时，壁纸会固定覆盖整个首屏，首页内容则被移动到首屏下方。

也就是说，只要页面最终得到的是：

```text
data-wallpaper-mode="fullscreen"
data-fullscreen-layout="hero"
```

Hero 模式就应该正常工作。

至此，问题开始变得清晰：或许不是 Hero 样式没有生效，而是 `data-fullscreen-layout` 最终根本没有被设置成 `hero`。

# 找到真正覆盖配置的地方

继续检查 `Layout.astro` 的页面初始化逻辑后，我发现程序会先读取浏览器中的 `localStorage`：

```js title="src/layouts/Layout.astro"
const storedFullscreenLayout =
	localStorage.getItem("fullscreenLayout");

const resolvedFullscreenLayout =
	storedFullscreenLayout === "hero" ||
	storedFullscreenLayout === "classic"
		? storedFullscreenLayout
		: fullscreenLayout;
```

这段代码的含义是：

1. 先检查浏览器是否保存过全屏布局；
2. 如果保存值是 `hero` 或 `classic`，就优先使用保存值；
3. 只有没有有效保存值时，才使用配置文件中的布局。

我之前曾经使用过 `classic` 布局，因此浏览器中很可能还保存着：

```js frame="terminal" title="浏览器控制台"
localStorage.getItem("fullscreenLayout");
// "classic"
```

于是，即使后来把配置文件改成：

```ts title="src/config/backgroundWallpaper.ts"
layout: "hero",
```

初始化脚本仍然会选择浏览器中遗留的 `classic`。

最终页面得到的其实是：

```html
<html data-fullscreen-layout="classic">
```

配置没有失效，Hero 样式也没有失效。真正的问题是：配置值在页面初始化时被旧的本地记录覆盖了。

# 为什么这是一个程序问题

如果项目允许用户在显示设置中切换全屏布局，那么优先使用用户保存的选择是合理的。

但这个项目还有一个显示设置总开关。当全屏布局切换功能关闭时，用户已经无法通过界面切换或重置布局，此时页面却仍然读取以前保存的值。

这会导致一种不太合理的状态：

- 项目维护者在配置文件中设置了 `hero`；
- 全屏布局切换功能已经关闭；
- 浏览器仍然使用过去保存的 `classic`；
- 用户无法从界面中恢复配置默认值。

对比壁纸模式的处理逻辑后，我还发现，项目已经对 `wallpaperMode` 考虑了类似情况：

```ts title="src/utils/setting-utils.ts"
if (!isSwitchable) {
	localStorage.removeItem("wallpaperMode");
	return backgroundWallpaper.mode;
}
```

当壁纸模式不允许切换时，旧记录会被清除，并直接采用项目配置。

而 `fullscreenLayout` 缺少了同样的判断。这正是问题的根源。

# 修复思路

修复目标很明确：

- 如果全屏布局允许用户切换，就继续读取并保留用户保存的选择；
- 如果全屏布局不允许切换，就忽略并清除旧记录，始终采用配置文件中的布局。

首先，我修改了 `getStoredFullscreenLayout()`。当布局切换功能关闭时，程序会清除旧记录并直接返回配置中的默认布局：

```diff lang="ts" title="src/utils/setting-utils.ts"
 export function getStoredFullscreenLayout(): FullscreenWallpaperLayout {
 	const defaultLayout = getDefaultFullscreenLayout();

 	if (
 		typeof localStorage === "undefined" ||
 		typeof localStorage.getItem !== "function"
 	) {
 		return defaultLayout;
 	}

+	const isSwitchable =
+		displaySettingsConfig.fullscreenLayoutSwitchable;
+
+	if (!isSwitchable) {
+		localStorage.removeItem("fullscreenLayout");
+		return defaultLayout;
+	}
+
 	const stored = localStorage.getItem("fullscreenLayout");

 	return stored === "hero" || stored === "classic"
 		? stored
 		: defaultLayout;
 }
```

页面首屏初始化发生在客户端组件挂载之前，因此还需要同步修改 `Layout.astro`。这里不再无条件读取本地记录，而是先判断全屏布局是否允许切换：

```diff lang="js" title="src/layouts/Layout.astro"
-// 初始化全屏布局：优先使用设置面板保存的运行时选择
-const storedFullscreenLayout =
-	localStorage.getItem("fullscreenLayout");
+// 仅在允许切换时使用设置面板保存的运行时选择；否则配置值始终生效
+const storedFullscreenLayout = isFullscreenLayoutSwitchable
+	? localStorage.getItem("fullscreenLayout")
+	: null;
+
+if (!isFullscreenLayoutSwitchable) {
+	localStorage.removeItem("fullscreenLayout");
+}

 const resolvedFullscreenLayout =
 	storedFullscreenLayout === "hero" ||
 	storedFullscreenLayout === "classic"
 		? storedFullscreenLayout
 		: fullscreenLayout;
```

为了让内联初始化脚本能够获得这个开关，还需要将解析后的配置值传入脚本：

```diff lang="astro" title="src/layouts/Layout.astro"
 <script
 	is:inline
 	define:vars={{
 		defaultWallpaperMode: backgroundWallpaper.mode,
 		isWallpaperSwitchable:
 			displaySettingsConfig.wallpaperModeSwitchable,
+		isFullscreenLayoutSwitchable:
+			displaySettingsConfig.fullscreenLayoutSwitchable,
 		fullscreenLayout,
 	}}
 >
```

这样，首屏渲染和后续客户端初始化使用了完全一致的规则。

# 验证修复

为了稳定复现原来的问题，我先在浏览器中写入一个旧值：

```js frame="terminal" title="浏览器控制台"
localStorage.setItem("fullscreenLayout", "classic");
```

然后将项目配置设为：

```ts title="src/config/backgroundWallpaper.ts"
mode: "fullscreen",

fullscreen: {
	layout: "hero",
},
```

在关闭全屏布局切换功能的情况下刷新页面。

修复前，页面仍然采用 `classic`。

修复后，我确认了以下结果：

- 页面立即使用了配置中的 Hero 布局；
- HTML 上的 `data-fullscreen-layout` 为 `hero`；
- `localStorage` 中遗留的 `fullscreenLayout` 已被删除；
- 再次刷新页面后，Hero 布局仍然正常；
- 重新启用布局切换功能后，用户选择的布局依然可以正常保存。

这说明修复没有取消原有的用户偏好功能，只是让本地存储的优先级与功能开关保持一致。

# 写在最后

这次问题表面上看起来像是 CSS 或 Hero 布局实现错误，但真正的原因却是浏览器里一条不起眼的本地记录。

整个排查过程也再次提醒我：当一个配置看起来“没有生效”时，不能只盯着配置定义和样式本身，还应该检查它的完整读取链路：

```text
配置默认值
    ↓
运行时状态
    ↓
浏览器持久化数据
    ↓
DOM 属性
    ↓
最终样式
```

尤其是同时支持“项目默认配置”和“用户运行时设置”的功能，必须明确两者的优先级：

- 功能允许用户调整时，用户选择优先；
- 功能不允许用户调整时，项目配置优先；
- 已经失去作用的历史记录，应当及时清理。

这次修改本身并不复杂，真正花时间的是找出究竟是哪一层覆盖了配置。

好在最后并不需要重写 Hero 布局，也不需要大范围调整样式。只要让 `fullscreenLayout` 与已有的 `wallpaperMode` 遵循相同的状态管理规则，问题就自然解决了。
