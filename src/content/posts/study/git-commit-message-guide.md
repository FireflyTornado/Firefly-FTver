---
title: "Git Commit 常用内容"
published: 2026-09-13
tags: [Git]
description: "本文记录一些提交commit时会使用到的内容。"
category: 学习
---

# 1. 快速查找

如果只是想快速判断某次提交应该使用哪一种 `type`，可以先查看下面的速查内容；如果需要理解每个字段的含义、适用边界和完整写法，再继续阅读后面的详细说明。

> [!TIP]
> 对日常提交来说，先判断“这次修改主要做了什么”通常就能确定 `type`。`scope` 和 `description` 则是在此基础上进一步说明“改了哪里”和“具体改了什么”。

## 常用类型速查表

| 类型 | 用途 | 常见场景 |
| --- | --- | --- |
| `feat` | 新增功能 | 新页面、新 API、新功能、新配置 |
| `fix` | 修复问题 | Bug、异常、错误行为、兼容性问题 |
| `docs` | 文档修改 | README、使用说明、API 文档 |
| `style` | 代码格式 | 缩进、空格、换行、格式化 |
| `refactor` | 代码重构 | 重组结构、提取方法、清理重复代码 |
| `perf` | 性能优化 | 降低耗时、减少请求、优化内存 |
| `test` | 测试相关 | 单元测试、集成测试、测试数据 |
| `build` | 构建相关 | 依赖、Gradle、Maven、Webpack、Vite |
| `ci` | CI/CD | GitHub Actions、自动测试、自动发布 |
| `chore` | 日常维护 | 清理文件、配置整理、维护任务 |
| `revert` | 撤销修改 | 撤销之前的 Commit |

## 快速判断

```text
新增功能              -> feat
修复错误              -> fix
只改文档              -> docs
只改代码格式          -> style
重构但行为基本不变    -> refactor
提高性能              -> perf
修改测试              -> test
修改依赖或构建        -> build
修改 CI/CD            -> ci
其他维护工作          -> chore
撤销已有提交          -> revert
```

> [!NOTE]
> 速查表适合快速选择提交类型，但同一种修改在不同项目规范中可能存在细微差异。确定 `type` 后，可以继续参考后文对应章节了解具体适用场景。

---

# 2. Commit Message 的基本结构

在快速确定提交类型之后，可以进一步了解一条 Commit Message 是如何组成的。推荐格式仍然是：

```text
<type>(<scope>): <description>
```

其中 `type` 决定提交类别，`scope` 说明修改范围，`description` 则概括具体变更。后续章节会依次展开这三个部分，并补充 Body、Footer 和 Breaking Change。

其中：

- `type`：本次提交的类型。
- `scope`：可选，表示本次修改影响的模块、功能或范围。
- `description`：简短描述本次提交做了什么。

例如：

```text
feat(auth): add password reset flow
fix(ui): prevent modal from overflowing viewport
docs(readme): update installation instructions
```

如果修改范围比较明确，可以写 `scope`；如果没有必要，也可以省略：

```text
feat: add user search
fix: handle empty response
```---

---

# 3. `type`：提交类型

`type` 用于概括这次提交属于哪一类修改，是 Commit Message 中最主要的分类信息。

## `feat`：新增功能

### 适用场景

用于加入新的用户可见功能、能力或行为。

例如：

- 新增一个页面。
- 新增一个按钮或操作入口。
- 新增一个 API。
- 新增一种配置选项。
- 新增搜索、筛选、导出等功能。
- 新增程序原本不具备的能力。

### 示例

```text
feat: add user search
```

```text
feat(profile): add avatar upload
```

```text
feat(api): support pagination
```


> [!NOTE]
> 如果只是调整已有功能的内部实现，而没有新增功能，通常更适合使用 `refactor`。

---

## `fix`：修复问题

### 适用场景

用于修复 Bug、异常行为或不符合预期的问题。

例如：

- 修复程序崩溃。
- 修复数据显示错误。
- 修复按钮无法点击。
- 修复布局异常。
- 修复边界条件处理错误。
- 修复兼容性问题。
- 修复空值、越界等异常。

### 示例

```text
fix: handle empty response
```

```text
fix(ui): prevent modal from overflowing viewport
```

```text
fix(parser): handle malformed input
```

---

## `docs`：文档修改

### 适用场景

仅修改文档，不涉及程序功能。

例如：

- 修改 `README.md`。
- 补充安装说明。
- 更新使用方法。
- 修改 API 文档。
- 修正注释中的说明性错误。
- 增加开发文档或贡献指南。

### 示例

```text
docs: update installation guide
```

```text
docs(readme): add configuration examples
```

```text
docs(api): document pagination parameters
```

### 注意

> [!IMPORTANT]
> 如果修改的是代码注释，同时还修改了实际代码逻辑，应根据主要修改内容选择其他类型。

---

## `style`：代码格式调整

### 适用场景

用于不影响程序逻辑的代码风格修改。

例如：

- 调整缩进。
- 修改空格。
- 调整换行。
- 修改引号风格。
- 统一分号。
- 调整代码格式。
- 使用格式化工具重新格式化代码。

### 示例

```text
style: format source files
```

```text
style(ui): normalize indentation
```

### 注意

> [!WARNING]
> 这里的 `style` 一般指**代码格式**，不是 UI 视觉样式。
>
> 如果修改了页面颜色、布局、动画等实际 UI 效果，通常更适合使用：
>
> ```text
> feat(ui): add dark mode
> ```
>
> 或者：
>
> ```text
> fix(ui): correct button alignment
> ```

---

## `refactor`：代码重构

### 适用场景

修改代码结构或实现方式，但原则上不增加新功能，也不修复特定 Bug。

例如：

- 拆分大型函数。
- 提取公共方法。
- 重组类结构。
- 重命名内部变量或方法。
- 调整模块结构。
- 替换等价实现。
- 清理重复代码。

### 示例

```text
refactor: simplify configuration loading
```

```text
refactor(auth): extract token validation logic
```

```text
refactor(api): reorganize request handlers
```

### 判断方法

> [!TIP]
> 如果修改前后用户看到的功能基本不变，而主要变化发生在内部代码结构，通常可以使用 `refactor`。

---

## `perf`：性能优化

### 适用场景

用于提升运行速度、降低资源消耗或提高效率。

例如：

- 减少重复计算。
- 优化数据库查询。
- 减少网络请求。
- 减少内存占用。
- 优化缓存。
- 加快页面渲染。
- 优化大型数据处理性能。

### 示例

```text
perf: reduce unnecessary database queries
```

```text
perf(cache): avoid repeated file reads
```

```text
perf(render): reduce redundant component updates
```

---

## `test`：测试相关修改

### 适用场景

用于添加、修改或整理测试代码。

例如：

- 新增单元测试。
- 新增集成测试。
- 补充边界条件测试。
- 修复测试代码。
- 更新测试数据。
- 调整测试配置。

### 示例

```text
test: add validation tests
```

```text
test(auth): cover expired token cases
```

```text
test(api): update response fixtures
```

---

## `build`：构建系统或依赖修改

### 适用场景

用于影响项目构建过程、依赖管理或打包方式的修改。

例如：

- 修改 `package.json`。
- 修改 Maven 或 Gradle 配置。
- 添加、升级或删除依赖。
- 修改构建脚本。
- 修改打包配置。
- 修改编译参数。
- 调整 Vite、Webpack 等构建工具配置。

### 示例

```text
build: update project dependencies
```

```text
build(gradle): update JavaFX dependencies
```

```text
build(vite): adjust production bundle settings
```

### 与 `chore` 的区别

> [!TIP]
> 如果修改直接影响编译、打包、依赖或构建流程，优先使用 `build`。

---

## `ci`：持续集成配置修改

### 适用场景

用于 CI/CD 自动化流程。

例如：

- 修改 GitHub Actions。
- 修改 GitLab CI。
- 调整自动测试流程。
- 修改自动构建流程。
- 修改自动发布流程。
- 修改流水线环境变量。

### 示例

```text
ci: add automated test workflow
```

```text
ci(github): update release workflow
```

```text
ci: run tests on multiple Java versions
```

---

## `chore`：日常维护

### 适用场景

用于不属于功能、修复、文档、测试、构建等主要分类的维护性修改。

例如：

- 清理无用文件。
- 更新 `.gitignore`。
- 修改开发辅助脚本。
- 整理目录。
- 更新非核心配置。
- 清理临时内容。
- 修改项目维护相关设置。

### 示例

```text
chore: remove unused files
```

```text
chore: update gitignore
```

```text
chore(config): clean up development settings
```

### 注意

> [!WARNING]
> 不要把所有无法判断的提交都写成 `chore`。如果有更具体的类型，应优先使用更具体的类型。

---

## `revert`：撤销提交

### 适用场景

用于撤销之前的一次或多次提交。

通常由：

```bash
git revert <commit>
```

产生。

### 示例

```text
revert: revert "feat: add user search"
```

或者：

```text
revert: restore previous authentication behavior
```

---

## 其他常见类型

不同项目可能会根据需要扩展 Commit 类型。

### `security`

用于安全相关修改。

```text
security: sanitize user input
```

```text
security(auth): tighten token validation
```

不过 Conventional Commits 并没有强制定义 `security`，因此是否使用取决于项目规范。

---

### `deps`

有些项目会单独使用 `deps` 表示依赖修改。

```text
deps: update runtime dependencies
```

但更多项目会统一使用：

```text
build: update dependencies
```

或者：

```text
chore(deps): update dependencies
```

建议在同一个项目中保持一致。

---

### `release`

有些项目使用 `release` 表示版本发布。

```text
release: v2.1.0
```

也有项目使用：

```text
chore(release): v2.1.0
```

---

# 4. `scope`：修改范围

`scope` 用于表示本次修改影响的范围。

格式：

```text
type(scope): description
```

例如：

```text
feat(auth): add password reset
```

```text
fix(ui): correct sidebar spacing
```

```text
docs(api): update request examples
```

常见 Scope 可以是：

```text
auth
api
ui
config
database
router
editor
logger
cache
installer
updater
docs
tests
```

> [!NOTE]
> Scope 不需要过度细化。如果修改范围比较广，可以直接省略。
>
> ```text
> refactor: reorganize project structure
> ```

---

# 5. `description`：简短描述

Commit 的第一行应该尽量简短地说明：

> 这次提交做了什么？

推荐：

```text
fix: handle missing configuration
```

不推荐：

```text
fix: bug
```

不推荐：

```text
update code
```

不推荐：

```text
change some files
```

> [!TIP]
> 好的 Description 通常应该简洁、具体，能够说明修改目的，并且不依赖打开代码也能理解大致内容。

---

# 6. Commit 的扩展信息

当第一行不足以完整说明一次提交时，可以继续使用 Body、Footer 或 Breaking Change。

## Commit Body

如果第一行无法说明清楚，可以添加正文。

格式：

```text
type(scope): short description

Detailed explanation of the change.
```

例如：

```text
fix(cache): avoid loading stale configuration

Always reload the configuration after the source file changes.
This prevents outdated values from being reused.
```

> [!TIP]
> Body 适合说明为什么要修改、原来的问题是什么、采用了什么处理方式，以及是否存在需要注意的行为变化。

## Footer

Footer 通常用于记录：

- Issue。
- Pull Request。
- Breaking Change。
- 其他关联信息。

例如：

```text
fix(api): handle invalid query parameters

Closes #128
```

也可以：

```text
Refs #128
```

常见写法包括：

```text
Closes #123
Fixes #123
Refs #123
```

具体支持情况取决于 Git 托管平台。

## Breaking Change

如果提交包含不兼容修改，应明确标识。

### 写法一：使用 `!`

```text
feat(api)!: change response format
```

### 写法二：Footer

```text
feat(api): change response format

BREAKING CHANGE: the `data` field is now an object instead of an array.
```

也可以两种方式同时使用。

常见 Breaking Change：

- 删除原有 API。
- 修改公开方法参数。
- 修改配置文件格式。
- 修改数据库结构且无法向后兼容。
- 修改 CLI 参数。
- 修改外部依赖的调用方式。

---

# 7. 如何组织一次 Commit

> [!IMPORTANT]
> 最好让一次 Commit 只完成一个相对独立的目的。

例如，不建议：

```text
feat: add search and fix login and update docs
```

更推荐拆分成：

```text
feat(search): add keyword filtering
```

```text
fix(auth): handle invalid login state
```

```text
docs: update usage guide
```

这样可以让提交历史更加清晰，也方便：

- Code Review。
- `git bisect`。
- `git revert`。
- Cherry-pick。
- 查看历史。

---

# 8. 常见场景与完整示例

## 常见场景

### 新增登录页面

```text
feat(auth): add login page
```

### 修复登录失败后没有错误提示

```text
fix(auth): show error message after failed login
```

### 调整按钮间距

如果这是实际 UI 行为或视觉修正：

```text
fix(ui): correct button spacing
```

如果只是代码格式：

```text
style(ui): format button styles
```

### 重构登录逻辑

```text
refactor(auth): extract login validation
```

### 优化图片加载速度

```text
perf(image): reduce unnecessary image requests
```

### 更新 README

```text
docs(readme): update setup instructions
```

### 升级依赖

```text
build: update dependencies
```

或者项目统一采用：

```text
chore(deps): update dependencies
```

### 添加测试

```text
test(auth): add login validation tests
```

### 修改 GitHub Actions

```text
ci(github): update build workflow
```

### 删除无用文件

```text
chore: remove unused assets
```

## 一个比较完整的 Commit

```text
feat(search): add advanced filter options

Add filters for category, date and status.
Preserve selected filters when navigating back to the result page.

Closes #245
```

## Breaking Change 示例

```text
feat(config)!: replace legacy configuration format

Replace the old flat configuration structure with grouped sections.

BREAKING CHANGE: existing configuration files must be migrated to the new format.
```

---

# 9. 基本原则

前面的速查表解决的是“应该选哪个类型”，而这里更关注如何让提交历史长期保持清晰、可读和可维护。

Commit Message 最重要的不是追求复杂，而是：

> [!IMPORTANT]
> **让别人仅通过提交历史，就能快速理解每次修改做了什么。**
