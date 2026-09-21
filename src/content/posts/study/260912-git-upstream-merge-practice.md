---
title: "一次 Git 上游分支合并记录"
published: 2026-09-12
tags: [Git, Firefly, 前端]
description: "记录一次将 upstream/master 合并到个人 master 的过程。"
category: 学习
---

今天我比较完整地走了一遍 Git 在真实项目里的使用流程。

我本身并不是第一次写代码，也不是第一次见到 `git add`、`git commit`、`git push` 这些命令。以前开发时也会把代码提交到 GitHub，但那种使用方式更多只是把 Git 当成一个“保存版本、上传代码”的工具。

这一次不同。

我维护的是一个基于上游开源项目修改出来的个人版本。官方仓库还在不断更新，而我的版本里又已经加入了自己的页面、配置等定制内容。于是问题从“怎么把代码上传到 GitHub”变成了：

> **怎样长期维护一个会持续跟随官方更新、同时又保留自己修改历史的分支？**

这篇文章不是一份操作日志，而是一次真实项目中的版本管理复盘。相比“我先输入了什么命令”，我更想记录的是：**为什么这样做、冲突为什么会出现，以及我最后是依据什么做出取舍。**

如果你只是想看相关用法的总结，可以直接跳转到 [第十二节](#git-knowledge-summary)。

---

# 先明确目标：我要保留的是“分叉过、又重新合并”的真实历史

我的项目基于 Firefly 继续修改。

现在我同时维护两个远程。`origin` 指向我自己的 GitHub 仓库；`upstream` 指向官方 Firefly 仓库。对我而言，`origin/master` 代表我的远程版本，而 `upstream/master` 代表官方的最新版本。

可以用下面的命令查看当前远程仓库配置：

```bash
git remote -v
```

这里有一个以前没有认真区分的点：

> `origin` 和 `upstream` 并不是 Git 的特殊关键字，它们本质上只是远程仓库的名字。

`origin` 只是 `git clone` 时 Git 通常默认给源仓库取的名字；而 `upstream` 是我为了区分“官方上游”而人为添加的名称。

真正让我做选择的是分支已经发生了分叉：

```text
                官方继续开发
               D──E──F
              /
A──B──C──────
       \
        X──Y
           ↑
        我的修改
```

我的 `master` 有自己的提交，官方 `upstream/master` 也在继续向前。此时我面对的是 `merge` 和 `rebase` 两种不同思路。

如果使用：

```bash
git rebase upstream/master
```

我的提交会被重新放到官方最新提交之后，历史会变得非常线性：

```text
A──B──C──D──E──F──X'──Y'
```

这种方式很整洁，但它会重写我原来的提交。

而我这次真正想保留的是另一件事：

> 官方代码和我的个人修改曾经沿着两条路线发展，随后我在某个时间点把它们重新合并到一起。

所以我最终选择：

```bash
git merge --no-ff upstream/master
```

我特意保留 `--no-ff`，因为我希望历史中明确留下一个 Merge Commit，让以后回看 Git Graph 时能直接看到：

- 官方继续开发的轨迹；
- 我的个性化修改轨迹；
- 两条历史重新汇合的位置。

这对我来说，比一条“看起来一直都很整齐”的线性历史更符合实际。

---

# 真正值得记录的不是命令，而是三类不同的冲突

这次合并过程中，Git 自动处理了不少文件，但以下几类冲突需要我自己判断：

```text
src/components/layout/Footer.astro
src/config/FooterConfig.html
src/config/footerConfig.ts
src/config/navBarConfig.ts
src/config/profileConfig.ts
src/config/siteConfig.ts
```

其中大部分是 `CONFLICT (content)`，而 `footerConfig.ts` 是 `CONFLICT (modify/delete)`。

刚看到 `Automatic merge failed` 时，很容易下意识把它理解成“合并失败了”。但实际更准确的理解是：

> Git 已经完成了能自动完成的部分；剩下这些地方存在多个合理结果，所以必须由开发者自己决定。

因此冲突并不是 Git 出错，而是 Git 在把决策权交回来。

我主要通过 VS Code Merge Editor 来处理这些问题。这里最重要的三个概念是：

- `Current`：我执行 merge 时所在的 `master`
- `Incoming`：正在被合入的 `upstream/master`
- `Result`：最终真正会进入 Merge Commit 的结果

这次最重要的认识之一，就是 **Result 并不一定等于 Current，也不一定等于 Incoming**。

很多真实冲突的正确答案其实是：

> **保留一部分 Current，吸收一部分 Incoming，再做必要的人工调整。**

---

# 第一类冲突：个人配置不应该被“官方默认值”覆盖

`siteConfig.ts` 和 `profileConfig.ts` 都属于非常典型的个人配置冲突。

例如 `siteConfig.ts` 中，官方新版的标题是 `title: "Firefly"`，而我的版本是 `title: "Nightbug Inn"`。导航栏标题也类似，官方是 `title: "Firefly Blog"`，而我的是 `title: "Nightbug Inn"`。

除此之外，还有：

- site URL
- subtitle
- description
- keywords
- themeColor
- 页面开关
- 文章列表布局
- Bilibili UID
- 站点开始时间

这些内容的本质并不是“官方代码更新了，而我的代码旧了”，而是：

> **官方默认配置和我的实际站点配置不同。**

同理，`profileConfig.ts` 中官方保留的是官方作者的头像、名称、签名和链接，而我的版本则是自己的资料。

因此这两类文件最后都保留了我的旧配置：

- `siteConfig_new.ts == siteConfig_old.ts`
- `profileConfig_new.ts == profileConfig_old.ts`

这里真正重要的判断原则是：

> **先看这个文件在项目里的职责，再决定哪一侧才是正确来源。**

如果这是“个人配置”，那官方版本即使更新得更晚，也并不意味着它更适合我的项目。

---

# 第二类冲突：文本能合上，不代表逻辑一定正确

`navBarConfig.ts` 让我更直观地体会到了这一点。

我的版本里新增了自己的导航结构，例如：

- 足迹
- 娱乐
- 关于本站

GitHub 链接也改成了自己的仓库，还增加了 Bilibili 等个人链接。

官方新版则保留了自己的 GitHub / Gitee 配置。

这类对象数组在 Merge Editor 里很容易出现一种危险情况：**文本块看似合并成功，但对象内部的字段被错误拼接**。

当时就出现过类似这样的组合：

```ts
{
    name: "Bilibili",
    ...
    icon: "fa7-brands:gitee",
}
```

从语法上看，它完全可能是合法的。

从 Git 的角度看，它也可能已经“没有冲突”。

但从逻辑上看，它显然是错误的。

所以这次我真正理解到：

> **Merge Editor 解决的是文本冲突，不是业务逻辑。**

最终 `navBarConfig_new.ts == navBarConfig_old.ts`，因为我希望继续保留自己的导航结构。但更重要的是，我开始意识到：**任何人工合并后的对象、数组、配置文件，都必须再做一次逻辑检查。**

---

# 最关键的案例：Footer 不是“选哪一边”，而是一次真正的架构迁移

这次最值得记录的其实不是前面的配置冲突，而是 Footer。

它同时涉及：

- `FooterConfig.html`
- `Footer.astro`
- `footerConfig.ts`

这三者一起看，才能理解官方这次到底改了什么。

## `FooterConfig.html`：官方只提供入口，而我已经真正使用了它

官方最新版的 `FooterConfig.html` 基本只是一个说明：

```html
<!--
    你可以在这个文件中使用HTML内容自定义网站底部的footer
    You can use html to customize the footer at the bottom of the website in this file.
-->
```

而我的版本已经真正使用了这个入口，里面有完整的：

- Footer 样式
- 徽章
- Astro / Tailwind / Twikoo / Algolia 等信息
- 备案区域
- 站点运行时间
- 主题版本号
- `__THEME_VERSION__` 占位符
- JavaScript 运行逻辑

所以这部分最终自然保留我的版本：

`FooterConfig_new.html == FooterConfig_old.html`

但真正复杂的问题并不在 HTML 本身，而在它和 `Footer.astro` 的配合方式。

## 官方已经移除了旧的 `footerConfig` 机制

我的旧 `Footer.astro` 中有：

```ts
import { footerConfig, profileConfig } from "@/config";
```

并且读取 Footer HTML 时还有：

```ts
if (footerConfig.enable) {
    ...
}
```

也就是说，旧结构可以理解成：

```text
footerConfig.ts
      ↓
enable
      ↓
Footer.astro
      ↓
FooterConfig.html
```

但官方新版已经移除了 `footerConfig`，变成：

```ts
import { profileConfig } from "@/config";
```

并且 `Footer.astro` 直接读取 `FooterConfig.html`。

也就是说，官方已经把结构简化成：

```text
Footer.astro
      ↓
直接读取
      ↓
FooterConfig.html
```

这就解释了为什么 `footerConfig.ts` 会出现 `modify/delete` 冲突：

- 我的分支还在修改和使用它；
- 官方分支已经直接把它删除了。

如果只看单个文件，很容易误以为这是一个“官方删了、我没删”的普通冲突。

但把三份 Footer 相关文件放在一起看，就能确认：

> **这不是随手删除，而是一次明确的架构重构。**

## 我又不能简单接受官方 `Footer.astro`

问题在于，我自己的旧版 Footer 还有一个官方没有的功能。

我会读取 `package.json` 中的版本号，然后把 `FooterConfig.html` 里的 `__THEME_VERSION__` 替换成真实主题版本：

```ts
customFooterHtml = customFooterHtml.replace(
    /__THEME_VERSION__/g,
    themeVersion,
);
```

如果我完整接受官方 `Footer.astro`，这个功能会丢失。

但如果我完整保留自己的旧版，又会继续依赖已经被官方淘汰的 `footerConfig.ts`。

所以这里真正合理的结果不是“接受 Current”或“接受 Incoming”，而是：

> **采用官方的新架构，同时把我真正需要的功能迁移过去。**

## 最终 Footer 是怎么合出来的

最终版做了几件事。

**接受官方的变化：**

- 删除 `footerConfig` import
- 不再使用 `footerConfig.enable`
- 直接读取 `FooterConfig.html`
- 接受新版 Footer DOM 结构
- 采用更稳妥的异常处理

**保留我的功能：**

- 从 `package.json` 读取主题版本号
- 替换 `__THEME_VERSION__`

因此最终：

- `Footer.astro` 不等于 old
- `Footer.astro` 也不等于 upstream
- 它是真正由两边变化融合得到的第三个版本

这是这次最典型的三方合并案例。

---

# `modify/delete` 冲突真正考验的是“是否理解重构意图”

`footerConfig.ts` 的冲突类型是 `CONFLICT (modify/delete)`。

我的旧版还在修改它，官方新版则已经把整个文件删除。

Git 无法自动判断：

> 到底应该保留我的修改，还是接受官方删除？

一开始如果只从“我改过，所以不能丢”的角度出发，很容易选择保留。

但结合前面对 `Footer.astro` 的分析，我已经确认：

- 官方确实重构了 Footer；
- `footerConfig.enable` 已经没有存在必要；
- 我的真实功能已经迁移到新架构；
- `FooterConfig.html` 仍然继续使用；
- 版本号注入逻辑也已经保留下来。

这时删除 `footerConfig.ts` 才是合理的。

我执行：

```bash
git rm src/config/footerConfig.ts
```

这里的 `git rm` 不只是“删除文件”，在当前 merge 状态里，它同时意味着：

> **我选择“删除”作为这个 modify/delete 冲突的最终结果。**

这让我第一次真正理解：冲突处理不是“保护自己改过的东西”，而是判断 **哪些设计还应该继续存在**。

---

# 我最后形成了一套自己的冲突判断方法

这次合并之后，我觉得真正有价值的不是记住“哪个按钮怎么点”，而是形成了一套更稳定的判断方式。

### 1. 这是个人配置，还是公共逻辑？

如果是个人配置，例如站点标题、头像、链接，那通常应该优先保留自己的内容。

### 2. 官方是在改默认值，还是在重构架构？

如果只是默认值变化，不一定要跟。

如果是架构变化，就应该先理解重构目的。

### 3. 我的旧代码里，真正需要保留的是“实现”，还是“功能”？

Footer 就是典型例子。

我真正需要保留的是：

> 版本号自动注入功能

而不是：

> 旧的 `footerConfig.ts` 架构

### 4. Git 不报冲突，逻辑也可能错

对象、数组、配置文件尤其需要人工检查。

### 5. Result 才是最终答案

`Current` 和 `Incoming` 都只是输入。

真正进入历史的是最后的 `Result`。

---

# 这次使用到的工作流，其实可以压缩成很少几步

虽然这篇文章讨论了很多细节，但真正的上游同步流程其实很短。

先确认自己在正确分支：

```bash
git switch master
```

获取官方最新历史：

```bash
git fetch upstream
```

开始合并：

```bash
git merge --no-ff upstream/master
```

发生冲突后，用：

```bash
git status
```

确认当前状态，逐个处理文件。

普通冲突解决后：

```bash
git add <file>
```

如果最终决定删除：

```bash
git rm <file>
```

如果方向完全错了，可以在提交 Merge Commit 之前：

```bash
git merge --abort
```

全部解决后，提交并推送：

```bash
git commit
git push origin master
```

这部分命令本身其实不难。

真正难的是中间那一步：

> **理解冲突背后的代码意图。**

---

# 合并结束后，我才真正体会到 Git 历史的价值

这次 Merge Commit 是 `dcaed5bc`。

它有两个 parent：

- `dcaed5bc^1`：我 merge 前的 `master`
- `dcaed5bc^2`：这次被合入的 `upstream/master`

也就是说，对于这次合并，我可以随时回到三个明确状态：

- old：我的旧版
- upstream：官方新版
- new：最终合并版

这也是为什么后来即使我已经把工作区更新成最终版，仍然能把旧文件重新找出来。

例如查看我的旧版 Footer：

```bash
git show dcaed5bc^1:src/components/layout/Footer.astro
```

查看官方当时的 Footer：

```bash
git show dcaed5bc^2:src/components/layout/Footer.astro
```

查看最终版：

```bash
git show dcaed5bc:src/components/layout/Footer.astro
```

这件事让我真正意识到：

> Git 保存的不是“当前文件”，而是整个项目在不同提交节点上的历史快照。

---

# worktree 让我把这段历史真正“摊开”来看

为了更方便地做 old / upstream / new 三方对比，我没有把主工作区来回切换到旧提交，而是用了 `git worktree`。

例如创建 merge 前的个人版本：

```bash
git worktree add ../Firefly-before-merge dcaed5bc^1
```

创建官方当时的版本：

```bash
git worktree add ../Firefly-upstream dcaed5bc^2
```

这样我同时拥有：

```text
Desktop
│
├── Firefly
│   └── 最终 merge 后版本
│
├── Firefly-before-merge
│   └── 我的 merge 前版本
│
└── Firefly-upstream
    └── 官方 merge 前版本
```

这三个目录非常适合复盘：

- `Firefly-before-merge`：Current
- `Firefly-upstream`：Incoming
- `Firefly`：Result

而且主工作区完全不需要切换。

这两个历史 worktree 通常处于 detached HEAD，因为它们直接检出的是具体 commit，而不是分支。

对我这次“只看历史、不继续开发”的用途来说，这正合适。

使用完后可以先检查：

```bash
git worktree list
```

再确认两个历史 worktree 是否干净：

```bash
git -C ../Firefly-before-merge status
git -C ../Firefly-upstream status
```

确认没有需要保留的改动后：

```bash
git worktree remove ../Firefly-before-merge
git worktree remove ../Firefly-upstream
```

如果曾经直接手动删掉目录，还可以：

```bash
git worktree prune
```

清理残留登记。

值得注意的是，**删除 worktree 并不会删除那些历史 commit**。

worktree 只是“为某个历史节点临时打开一个额外工作目录”。

---

# 这次合并之后，我对 Git 的理解发生了什么变化

以前我对 Git 的理解更接近：

`修改文件 → git add → git commit → git push`

现在我开始把它理解成：

> **一套用于描述代码历史关系的数据结构和工具。**

这次我第一次把很多以前零散知道的概念真正串起来：

- 分支为什么只是指向 commit 的引用；
- `fetch` 为什么不会修改工作区；
- `merge` 为什么能保留真实分叉历史；
- `rebase` 为什么会改变 commit hash；
- Merge Commit 为什么有多个 parent；
- `^1`、`^2` 为什么能回到不同父提交；
- 为什么被删掉的旧文件还能重新取回；
- 为什么 worktree 能同时看到多个历史版本；
- 为什么 Git 说“冲突解决了”，也不代表程序逻辑一定正确。

这些东西一旦连起来以后，Git 就不再是一堆要背的命令。

它开始变成一套可以推理的系统。

---

<a id="git-knowledge-summary"></a>

# 这次实践涉及的 Git 知识完整总结

下面把这次实际使用到的知识集中整理一次。

这部分也是我以后再次同步 upstream 时，最希望自己能回来查阅的内容。

---

## 1. Git 的核心不是“文件备份”，而是提交图

Git 管理的是一张有向无环图（DAG）。

每个 commit：

- 有自己的 commit hash；
- 指向一个或多个 parent；
- 对应项目在那个时间点的快照；
- 包含作者、时间、提交信息等元数据。

普通 commit 通常有一个 parent。

Merge Commit 通常有两个或更多 parent。

因此，`分支` 本质上只是一个指向 commit 的可移动引用。

---

## 2. `HEAD` 表示我现在在哪里

通常，`HEAD -> master` 说明：

```text
HEAD
↓
master
↓
某个 commit
```

我当前检出的是 `master`。

如果直接检出某个 commit，而不是分支，可能进入 `detached HEAD`。此时 HEAD 直接指向 commit，而不是某个可移动分支。

这也是我创建历史 worktree 时看到的状态。

---

## 3. `origin` / `upstream` 是远程名称

它们不是固定角色。

在我的项目中约定：

```text
origin
= 我的 GitHub 仓库

upstream
= 官方 GitHub 仓库
```

远程信息可以查看：

```bash
git remote -v
```

---

## 4. `master` 与 `origin/master` 不是一回事

`master` 是本地分支。`origin/master` 是一个 remote-tracking branch，即：

> 我本地记录的“上一次获取远程信息时，origin 的 master 在哪里”。

同样，`upstream/master` 代表我本地记录的 upstream master 状态。

执行：

```bash
git fetch upstream
```

会更新 `upstream/master`，但不会直接修改我的 `master`。

---

## 5. `fetch` 和 `pull` 不一样

```bash
git fetch upstream
```

主要负责：

```text
下载远程对象
+
更新远程跟踪引用
```

它不会直接修改当前分支。

而：

```bash
git pull
```

通常可以理解成：

```text
fetch
+
merge/rebase
```

具体行为取决于配置。

这次我更喜欢把步骤拆开：

```bash
git fetch upstream
git merge --no-ff upstream/master
```

因为每一步发生了什么更加清楚。

---

## 6. 什么叫分叉

假如共同历史是：

```text
A──B──C
```

官方继续：

```text
A──B──C──D──E
```

而我自己：

```text
A──B──C──X──Y
```

那么就形成：

```text
        D──E
       /
A──B──C
       \
        X──Y
```

这就是 diverged history。

两边都拥有对方没有的新提交。

---

## 7. merge 的本质

merge 会寻找两条历史的共同祖先，也就是 `merge base`，然后综合：

```text
共同祖先
Current
Incoming
```

计算最终变化。

如果能自动判断，就自动合并；

如果无法唯一判断，就产生 conflict。

所以 Git merge 本身其实就是典型的“三方合并”。

---

## 8. rebase 的本质

rebase 并不是“把分支接过去”这么简单。

它会把当前分支独有的提交重新应用到新的 base 上。

因此，旧提交 `X` 通常会变成新的 `X'`，commit hash 也会随之改变。

所以，`rebase` 适合整理线性历史；`merge` 适合保留真实分叉历史。

这次我的目标明确是后者。

---

## 9. fast-forward 与 `--no-ff`

如果当前分支没有独立提交，目标分支只是单纯领先：

```text
A──B──C   master
       \
        D──E   upstream/master
```

某些情况下 merge 可以直接让 `master` 指向 `E`，而不创建额外 Merge Commit。

这就是 `fast-forward`。而：

```bash
git merge --no-ff ...
```

要求 Git 明确创建 Merge Commit。

我的目的就是保留“这里发生过一次上游同步”的历史节点。

---

## 10. Current / Incoming 是相对概念

在我这次：

```bash
git switch master
git merge upstream/master
```

的场景中：

```text
Current = master
Incoming = upstream/master
```

如果我站在另一个分支上反方向 merge，这两个角色也会反过来。

所以不能死记：

```text
Current = 我的
Incoming = 官方
```

真正应该记：

```text
Current
= 当前 checkout 的分支

Incoming
= 被 merge 进来的那一侧
```

---

## 11. Result 才是最终真相

Merge Editor 中最重要的不是左边还是右边，而是 `Result`，因为最终 commit 保存的是 Result。

它可以：

```text
完全等于 Current
完全等于 Incoming
或者完全不同于两者
```

`Footer.astro` 就属于第三种。

---

## 12. content conflict

当双方修改同一个文件的重叠区域，Git 无法自动确定结果时，就可能出现 `CONFLICT (content)`。传统文本形式会出现：

```text
<<<<<<< HEAD
Current
=======
Incoming
>>>>>>> upstream/master
```

VS Code Merge Editor 只是把这些信息做成了更直观的 UI。

---

## 13. modify/delete conflict

如果一侧修改一个文件，而另一侧删除它：

```text
A：修改
B：删除
```

Git 无法自动决定：

```text
保留修改后的文件
还是
接受删除
```

所以会产生 `CONFLICT (modify/delete)`。`footerConfig.ts` 就是实际案例。

---

## 14. `git add` 在冲突解决时还有“确认结果”的含义

平时：

```bash
git add file
```

经常被理解成：

> 把文件加入暂存区。

但在 merge conflict 中，它还有一个重要语义：

> **我已经解决这个文件的冲突，请把现在的版本视为最终结果。**

所以修改完成后必须 `git add`，Git 才知道这个冲突已经处理结束。

---

## 15. `git rm` 同样可以解决 conflict

对 modify/delete conflict：

```bash
git rm file
```

意味着：

> 最终结果就是删除这个文件。

这次 `footerConfig.ts` 就是这样完成解决的。

---

## 16. `git status` 是 merge 过程中最重要的导航工具

任何不确定的时候：

```bash
git status
```

都非常有用。

它可以告诉我：

- 当前分支；
- 是否正在 merge；
- 未解决冲突；
- 已解决但尚未提交的文件；
- staged / unstaged 状态。

以后处理冲突时，比凭记忆猜当前状态可靠得多。

---

## 17. `git merge --abort`

如果 merge 进行到一半发现：

```text
方向错了
冲突太复杂
想重新开始
```

在尚未完成 Merge Commit 时通常可以：

```bash
git merge --abort
```

让仓库尽量恢复到 merge 开始之前。

这比手工乱删冲突文件安全得多。

---

## 18. Merge Commit 有多个 parent

普通提交里，`A ← B` 表示 B 有一个 parent A。

Merge：

```text
A──B──C
    \   \
     X───M
```

M 同时拥有：

```text
C
X
```

两个 parent。

因此可以使用 `M^1` 和 `M^2` 访问不同的父提交。

访问不同父提交。

---

## 19. `^1` 和 `^2` 的意义取决于 merge 方向

在：

```bash
git switch master
git merge upstream/master
```

中：

```text
M^1
= merge 前的 master

M^2
= upstream/master
```

这是因为第一个 parent 是当前分支原来的 tip，第二个 parent 是被合入的 tip。

---

## 20. `git log --graph --oneline --decorate`

这次我第一次觉得这条命令特别有价值：

```bash
git log --graph --oneline --decorate -10
```

其中，`--graph` 用来画提交拓扑；`--oneline` 把每个提交压缩成一行；`--decorate` 用来显示：

```text
HEAD
master
origin/master
upstream/master
```

等引用位置。

它比单纯看提交列表更容易理解 Git 的结构。

---

## 21. commit hash 是 Git 历史的精确坐标

例如，`dcaed5bc` 不是一个“版本号标签”，而是 commit ID 的缩写。

它可以直接用于：

```bash
git show dcaed5bc
git diff dcaed5bc^1 dcaed5bc
git worktree add ...
```

等操作。

只要没有发生历史重写，对特定 commit 的引用就很稳定。

---

## 22. Git 保存已 commit 的旧版本

当前文件被修改，不代表历史文件被覆盖。

只要曾经 commit，`旧内容` 仍然存在于对应 commit 的 tree 中。

因此可以：

```bash
git show <commit>:<path>
```

直接读取历史文件。

这也是为什么我后来还能完整找回合并前的旧版。

---

## 23. 未 commit 的内容则另当别论

Git 能恢复历史版本的前提是：

> 那些内容已经进入过 Git 历史。

如果一段代码：

```text
只存在于工作区
从未 commit
```

随后被覆盖或删除，那么 Git 本身不一定有它的对象。

这时可能需要：

- VS Code Local History
- IDE 本地历史
- 文件系统恢复
- 其他备份

所以：

> 有意义的阶段性工作应该及时 commit。

commit 不一定意味着“功能已经完美”，它首先是一个可恢复的历史节点。

---

## 24. `git worktree` 允许同一仓库同时检出多个版本

普通 checkout 会改变当前工作目录。

worktree 则允许：

```text
主目录检出 master
另一个目录检出旧 commit
再一个目录检出官方 commit
```

而且共享 Git 对象数据库。

非常适合：

- 多版本对比
- 修复历史版本
- 同时开发多个分支
- 复现旧 bug
- 写迁移文档

---

## 25. detached HEAD 并不是错误

当 worktree 直接检出“某个 commit”而不是“某个 branch”时，会进入 detached HEAD。

它非常适合只读历史快照。

真正需要注意的是：

> 如果在 detached HEAD 上创建了新 commit，又没有创建分支保存引用，那么以后不容易继续找到这些提交。

所以查看旧代码没问题；

如果准备开发，则最好：

```bash
git switch -c new-branch
```

创建分支。

---

## 26. worktree 应该用 Git 自己管理

查看：

```bash
git worktree list
```

删除：

```bash
git worktree remove <path>
```

如果目录已经被手动删掉：

```bash
git worktree prune
```

用于清理无效记录。

---

## 27. merge 通常不需要 force push

这次 merge 没有重写已有历史，只是在顶部增加了新的 Merge Commit。

因此：

```bash
git push origin master
```

即可。

而 rebase 已经推送过的提交后，才可能因为历史变更需要：

```bash
git push --force-with-lease
```

通常应该优先使用 `--force-with-lease`，而不是裸 `--force`，因为前者会额外检查远程状态，降低覆盖别人新提交的风险。

---

## 28. Git 解决的是历史，编译器解决的是代码正确性

一次 merge 能成功 commit，只能说明“Git 层面没有未解决冲突”，并不代表“程序一定正确”。例如前面的 `Bilibili + Gitee icon` 这种组合完全可能：

- 没有 Git conflict；
- TypeScript 语法也正确；
- 但业务逻辑错误。

所以 merge 后还应该进行：

```text
构建
测试
预览
功能检查
```

Git 不能替代这些步骤。

---

# 以后同步 upstream，我准备使用的标准流程

以后官方继续更新，我会先：

```bash
git switch master
git status
```

确认：

- 在正确分支；
- 工作区没有不希望混入 merge 的未提交内容。

然后：

```bash
git fetch upstream
```

查看历史：

```bash
git log --graph --oneline --decorate --all -20
```

确认确实需要合并后：

```bash
git merge --no-ff upstream/master
```

如果发生冲突：

```bash
git status
```

逐个处理。

普通文件：

```bash
git add <file>
```

接受删除：

```bash
git rm <file>
```

如果想放弃这次 merge：

```bash
git merge --abort
```

全部完成后：

```bash
git status
```

确认没有 `unmerged paths`，然后：

```bash
git commit
```

最后：

```bash
git push origin master
```

如果需要检查最终历史：

```bash
git log --graph --oneline --decorate -20
```

---

# 这次实践让我对 Git 的理解发生了什么变化

以前我对 Git 的理解更接近 `修改文件 → git add → git commit → git push`。现在，我开始把 Git 理解成：

**一套用于描述代码历史关系的数据结构和工具**

分支不是“复制出来的文件夹”；

远程不是“云端文件夹”；

merge 也不是“把两个文件夹覆盖到一起”。

它们实际在操作的是：

```text
commit
parent
reference
history graph
```

真正理解这些以后，很多 Git 命令突然就不再需要死记。

例如：

为什么 `fetch` 不改工作区？

因为它主要更新远程对象和 remote-tracking refs。

为什么 rebase 会变 commit hash？

因为它创建了拥有不同 parent 的新 commit。

为什么 merge commit 有 `^1` 和 `^2`？

因为它真的有两个 parent。

为什么已经被删掉的文件还能找回来？

因为旧 commit 的 tree 仍然记录着那个文件。

为什么 worktree 可以同时看到三个版本？

因为一个 Git repository 可以拥有多个工作目录，每个工作目录检出不同引用。

这些东西第一次真正连接在了一起。

---

# 结语

这次我原本只是想做一件很简单的事：

> 把 Firefly 官方的新更新同步到自己的版本里。

最后却变成了一次非常完整的 Git 实战。

我经历了：

```text
确认 origin / upstream
↓
fetch 官方历史
↓
观察分支分叉
↓
选择 merge 而非 rebase
↓
使用 --no-ff 保留 Merge Commit
↓
处理 content conflict
↓
处理 modify/delete conflict
↓
理解 Current / Incoming / Result
↓
判断配置冲突与架构冲突
↓
手工完成真正的三方合并
↓
commit
↓
push
↓
用 Git Graph 验证历史
↓
理解 Merge Commit parent
↓
用 worktree 恢复三个历史版本
↓
重新复盘 old / upstream / new
```

最重要的收获不是我记住了多少条命令。

而是我开始理解：

> **Git 的真正价值不是让我“能把代码上传到 GitHub”，而是让我可以明确地回答：代码是怎样一步一步变成今天这个样子的。**

这次我特意没有把官方线和个人线通过 rebase 压成一条“看起来一直都很整齐”的历史。

我希望真实保留：

```text
这里，我从官方版本分叉；
这里，我加入了自己的修改；
这里，官方继续向前更新；
这里，两套修改发生冲突；
这里，我理解两边代码后做出了自己的选择；
这里，它们重新合并。

```

对一个正在开始系统使用 Git 管理真实项目的人来说，我觉得这段历史本身就值得留下。

而下一次再看到 `CONFLICT` 时，我大概不会再把它理解成“Git 出问题了”。

它更像是在问我：

> **两个方向都发生了变化，你希望项目接下来长成什么样？**

这可能才是版本管理真正开始变得有意思的地方。
