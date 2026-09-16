---
title: "Git Branch 常用内容"
published: 2026-09-13
tags: [Git]
description: "本文整理 Git 中常用的分支相关命令。"
category: 学习
---

# 1. 快速查找

| 分类 | 操作 | 常用命令 |
|---|---|---|
| **查看与比较** | [查看分支](#view-branches) | `git branch` / `-r` / `-a` / `-vv` |
|  | [查看分支图](#view-graph) | `git log --graph --oneline --decorate --all` |
|  | [比较分支提交](#compare-commits) | `git log A..B --oneline` |
|  | [比较文件差异](#compare-diff) | `git diff A..B` |
|  | [查看共同祖先](#merge-base) | `git merge-base A B` |
|  | [查看操作历史](#reflog) | `git reflog` |
| **本地分支管理** | [创建分支](#create-branch) | `git branch <branch>` / `git switch -c <branch>` |
|  | [从指定提交创建分支](#create-from-commit) | `git branch <branch> <commit>` |
|  | [切换分支](#switch-branch) | `git switch <branch>` / `git checkout <branch>` |
|  | [重命名分支](#rename-branch) | `git branch -m ...` |
|  | [删除本地分支](#delete-local) | `git branch -d <branch>` / `-D` |
| **分支整合与历史调整** | [合并分支](#merge-branch) | `git merge <branch>` / `--no-ff` |
|  | [Rebase](#rebase) | `git rebase <branch>` |
|  | [Cherry-pick](#cherry-pick) | `git cherry-pick <commit>` |
|  | [Reset](#reset) | `git reset --soft` / `--mixed` / `--hard` |
| **远程仓库与同步** | [管理远程仓库](#remote-repo) | `git remote add` / `git remote -v` |
|  | [获取远程更新](#fetch) | `git fetch <remote>` |
|  | [拉取远程更新](#pull) | `git pull` / `git pull --rebase` |
|  | [推送分支](#push) | `git push` / `git push -u` |
|  | [设置上游关系](#upstream) | `git branch --set-upstream-to` / `--unset-upstream` |
|  | [删除远程分支](#delete-remote) | `git push <remote> --delete <branch>` |
| **过程控制** | [Merge 的继续与取消](#merge-control) | `git merge --continue` / `--abort` |
|  | [Rebase 的继续、跳过与取消](#rebase-control) | `git rebase --continue` / `--skip` / `--abort` |
|  | [Cherry-pick 的继续与取消](#cherry-pick-control) | `git cherry-pick --continue` / `--abort` |
| **临时保存** | [Stash](#stash) | `git stash` / `push` / `list` / `pop` |

> [!NOTE]
> 速查表用于快速定位命令。后文按照与表格相同的分类和顺序展开，便于从索引直接跳转到对应说明。

---

# 2. 查看与比较

本节用于查看当前分支状态、比较不同分支，以及检查提交历史。

---

<a id="view-branches"></a>
## 查看分支

### `git branch`

查看本地分支。

```bash
git branch
```

示例：

```text
* master
  dev
  feature/login
```

> [!NOTE]
> `*` 表示当前所在分支。

---

### `git branch -r`

查看远程跟踪分支。

```bash
git branch -r
```

示例：

```text
origin/master
origin/dev
upstream/master
```

---

### `git branch -a`

查看本地分支和远程跟踪分支。

```bash
git branch -a
```

---

### `git branch -vv`

查看本地分支、当前提交、上游跟踪关系及领先或落后状态。

```bash
git branch -vv
```

示例：

```text
* master  2bd887e8 [origin/master] Merge upstream/master
  dev     a1234567 [origin/dev: ahead 2] test
```

适用场景：

- 查看当前分支跟踪哪个远程分支
- 查看本地分支相对远程分支是否领先或落后

---

---

<a id="view-graph"></a>
## 查看分支图

### `git log --graph --oneline --decorate --all`

以图形方式查看所有分支的提交历史。

```bash
git log --graph --oneline --decorate --all
```

示例：

```text
*   2bd887e8 (HEAD -> master) Merge upstream/master
|\
| * 567313c1 (upstream/master) chore: update dependencies
| * ffd881d0 fix: resolve issue
* | 2aea090d feat: add new feature
|/
* abcdef12 previous commit
```

参数含义：

| 参数 | 作用 |
|---|---|
| `--graph` | 显示提交关系图 |
| `--oneline` | 每个提交显示为一行 |
| `--decorate` | 显示分支、标签和 HEAD |
| `--all` | 显示所有本地和远程跟踪分支 |

---

---

<a id="compare-commits"></a>
## 比较两个分支的提交

### `git log A..B --oneline`

查看 `B` 中存在、但 `A` 中不存在的提交。

例如：

```bash
git log master..upstream/master --oneline
```

表示查看：

```text
upstream/master 有、master 没有的提交
```

反过来：

```bash
git log upstream/master..master --oneline
```

表示查看：

```text
master 有、upstream/master 没有的提交
```

---

---

<a id="compare-diff"></a>
## 比较两个分支的文件差异

### `git diff A..B`

比较两个分支最终文件内容的差异。

```bash
git diff master..upstream/master
```

适用场景：

- 查看两个分支在文件内容上的差异
- 合并前检查修改内容

---

---

<a id="merge-base"></a>
## 查看共同祖先

### `git merge-base <branch1> <branch2>`

查找两个分支最近的共同祖先提交。

```bash
git merge-base master upstream/master
```

执行前：

```text
A---B---C---D
         \
          E---F
```

> [!NOTE]
> 如果两条分支从 `C` 开始分叉，则命令返回 `C` 的 Commit ID。

---

---

<a id="reflog"></a>
## 查看操作历史

### `git reflog`

查看 HEAD 和本地分支指针近期移动记录。

```bash
git reflog
```

示例：

```text
a1b2c3d HEAD@{0}: merge feature
d4e5f6a HEAD@{1}: commit: update implementation
7a8b9c0 HEAD@{2}: checkout: moving from feature to main
```

适用场景：

- 查找 Reset 前的提交
- 查找 Rebase 前的提交
- 查找误删除分支之前的位置

---

---

# 3. 本地分支管理

本节用于创建、切换、重命名和删除本地分支。

---

<a id="create-branch"></a>
## 创建分支

### `git branch <branch>`

从当前提交创建一个新分支，但不切换过去。

```bash
git branch dev
```

执行前：

```text
A---B---C
        ↑
      master
      HEAD
```

执行后：

```text
A---B---C
        ↑
   master, dev

HEAD -> master
```

---

### `git switch -c <branch>`

创建分支并立即切换到该分支。

```bash
git switch -c dev
```

执行前：

```text
A---B---C
        ↑
      master
      HEAD
```

执行后：

```text
A---B---C
        ↑
   master, dev
          ↑
         HEAD
```

等价于：

```bash
git branch dev
git switch dev
```

---

### `git switch -c <branch> <start-point>`

从指定提交或分支创建新分支并切换。

```bash
git switch -c feature upstream/master
```

执行前：

```text
A---B---C
        ↑
 upstream/master
```

执行后：

```text
A---B---C
        ↑
 upstream/master
 feature
 HEAD
```

适用场景：

- 从远程最新分支创建开发分支
- 从指定历史提交创建修复分支

---

---

<a id="create-from-commit"></a>
## 从指定提交重新创建分支

### `git branch <branch> <commit>`

从指定提交创建分支。

```bash
git branch recovery abc1234
```

执行前：

```text
A---B---C---D
    ↑
 abc1234
```

执行后：

```text
A---B---C---D
    ↑
 recovery
```

适用场景：

- 根据 `git reflog` 找回误删除的分支
- 从历史提交创建临时修复分支

---

---

<a id="switch-branch"></a>
## 切换分支

### `git switch <branch>`

切换到已有分支。

```bash
git switch dev
```

执行前：

```text
A---B---C
        ↑
   master, dev

HEAD -> master
```

执行后：

```text
A---B---C
        ↑
   master, dev

HEAD -> dev
```

---

### `git checkout <branch>`

旧版 Git 中常用的分支切换写法。

```bash
git checkout dev
```

效果与以下命令相同：

```bash
git switch dev
```

---

### `git checkout -b <branch>`

旧版 Git 中用于创建并切换分支。

```bash
git checkout -b dev
```

效果与以下命令相同：

```bash
git switch -c dev
```

---

---

<a id="rename-branch"></a>
## 重命名分支

### `git branch -m <new-name>`

重命名当前分支。

```bash
git branch -m main
```

执行前：

```text
A---B---C
        ↑
      master
```

执行后：

```text
A---B---C
        ↑
       main
```

---

### `git branch -m <old-name> <new-name>`

重命名指定分支。

```bash
git branch -m master main
```

---

---

<a id="delete-local"></a>
## 删除本地分支

### `git branch -d <branch>`

安全删除本地分支。

```bash
git branch -d dev
```

如果该分支存在尚未合并的提交，Git 通常会拒绝删除。

执行前：

```text
A---B---C---D
        ↑   ↑
     master dev
```

执行后：

```text
A---B---C---D
        ↑
      master
```

> [!NOTE]
> 该命令仅删除分支引用，不会创建新的提交。

---

### `git branch -D <branch>`

强制删除本地分支。

```bash
git branch -D dev
```

适用场景：

- 明确不再需要该分支
- 分支中存在未合并提交，但仍需要强制删除

> [!WARNING]
> `git branch -D` 会忽略“分支尚未合并”的保护检查。执行前应确认该分支中的提交不再需要。

---

---

# 4. 分支整合与历史调整

本节用于合并分支、重新应用提交，以及调整当前分支的提交位置。

---

<a id="merge-branch"></a>
## 合并分支

### `git merge <branch>`

将指定分支合并到当前分支。

例如：

```bash
git switch master
git merge dev
```

执行前：

```text
A---B---C
     \
      D---E

master -> C
dev    -> E
```

普通合并后：

```text
A---B---C-------M
     \         /
      D-------E

master -> M
dev    -> E
```

其中 `M` 为 Merge Commit。

适用场景：

- 将功能分支合并到主分支
- 将上游分支更新合并到当前分支
- 保留分叉和合并历史

---

### Fast-forward Merge

如果当前分支之后没有新的独立提交，Git 可能直接移动分支指针。

执行前：

```text
A---B---C---D---E
        ↑       ↑
     master    dev
```

执行：

```bash
git switch master
git merge dev
```

执行后：

```text
A---B---C---D---E
                ↑
           master, dev
```

> [!NOTE]
> Fast-forward 合并不会生成 Merge Commit，只会移动当前分支指针。

---

### `git merge --no-ff <branch>`

即使可以 Fast-forward，也强制创建 Merge Commit。

```bash
git merge --no-ff dev
```

执行前：

```text
A---B---C---D---E
        ↑       ↑
     master    dev
```

执行后：

```text
A---B---C-------M
         \     /
          D---E
```

适用场景：

- 需要明确保留一次分支合并记录

---

---

<a id="rebase"></a>
## Rebase

### `git rebase <branch>`

将当前分支上的提交重新应用到指定分支之后。

```bash
git switch dev
git rebase master
```

执行前：

```text
A---B---C
     \
      D---E

master -> C
dev    -> E
```

执行后：

```text
A---B---C---D'---E'
        ↑         ↑
     master      dev
```

> [!IMPORTANT]
> Rebase 会重新创建被移动的提交，因此这些提交的 Commit ID 会发生变化。

适用场景：

- 将开发分支更新到较新的基础分支之上
- 保持提交历史为线性结构

> [!WARNING]
> Rebase 会改写提交历史。对已经推送并被多人使用的公共分支执行 Rebase 时应谨慎。

---

---

<a id="cherry-pick"></a>
## Cherry-pick

### `git cherry-pick <commit>`

将指定提交的修改应用到当前分支，并创建一个新的提交。

执行前：

```text
A---B---C
     \
      D---E---F

master -> C
dev    -> F
```

执行：

```bash
git switch master
git cherry-pick <E的CommitID>
```

执行后：

```text
A---B---C---E'
     \
      D---E---F
```

适用场景：

- 只需要另一个分支中的一个或几个提交
- 将某个 Bug 修复单独应用到其他分支

---

---

<a id="reset"></a>
## Reset

### `git reset --soft <commit>`

移动当前分支到指定提交，并保留之后的修改在暂存区。

执行前：

```text
A---B---C
        ↑
      master
```

执行：

```bash
git reset --soft HEAD~1
```

执行后：

```text
A---B
    ↑
  master
```

`C` 中的修改仍处于暂存状态。

适用场景：

- 撤销最近一次提交，但保留已暂存的修改

---

### `git reset --mixed <commit>`

移动当前分支到指定提交，并将之后的修改保留在工作区。

```bash
git reset --mixed HEAD~1
```

也可以省略 `--mixed`：

```bash
git reset HEAD~1
```

执行后，修改不会处于暂存状态。

---

### `git reset --hard <commit>`

移动当前分支，并同步修改暂存区和工作区。

```bash
git reset --hard HEAD~1
```

执行前：

```text
A---B---C---D---E
                ↑
             master
```

执行：

```bash
git reset --hard C
```

执行后：

```text
A---B---C
        ↑
      master
```

> [!CAUTION]
> `git reset --hard` 会同步重置暂存区和工作区。未提交的修改可能被直接丢弃。

---

---

# 5. 远程仓库与同步

本节用于管理远程仓库、获取和推送更新，以及设置分支跟踪关系。

---

<a id="remote-repo"></a>
## 管理远程仓库

### `git remote add <name> <url>`

添加新的远程仓库。

```bash
git remote add upstream https://github.com/official/project.git
```

常见名称：

```text
origin    自己克隆或推送使用的远程仓库
upstream  上游仓库
```

---

### `git remote -v`

查看所有远程仓库地址。

```bash
git remote -v
```

示例：

```text
origin    git@github.com:user/project.git (fetch)
origin    git@github.com:user/project.git (push)
upstream  git@github.com:official/project.git (fetch)
upstream  git@github.com:official/project.git (push)
```

---

---

<a id="fetch"></a>
## 获取远程更新

### `git fetch <remote>`

从指定远程仓库获取最新提交和引用，但不自动修改当前本地分支。

```bash
git fetch upstream
```

执行前：

```text
本地：

A---B---C
        ↑
 upstream/master

远程：

A---B---C---D---E
```

执行后：

```text
A---B---C---D---E
                ↑
       upstream/master
```

> [!NOTE]
> `git fetch` 只更新远程跟踪引用，本地 `master` 不会自动移动。

适用场景：

- 获取远程最新状态
- 合并或 Rebase 前先检查远程更新

---

---

<a id="pull"></a>
## Pull

### `git pull`

获取当前分支上游远程的更新，并合并到当前分支。

```bash
git pull
```

> [!NOTE]
> 默认配置下，`git pull` 通常相当于先执行 `git fetch`，再执行 `git merge`。

对应命令：

```bash
git fetch
git merge
```

---

### `git pull <remote> <branch>`

从指定远程分支获取并合并。

```bash
git pull origin master
```

---

### `git pull --rebase`

获取远程更新后，以 Rebase 方式更新当前分支。

```bash
git pull --rebase
```

执行前：

```text
A---B---C---D
        \   ↑
         \ origin/master
          E---F
              ↑
            master
```

执行后：

```text
A---B---C---D---E'---F'
            ↑         ↑
      origin/master master
```

---

---

<a id="push"></a>
## 推送分支

### `git push <remote> <branch>`

将本地分支推送到远程仓库。

```bash
git push origin master
```

---

### `git push -u <remote> <branch>`

首次推送分支，并建立上游跟踪关系。

```bash
git push -u origin dev
```

建立：

```text
本地 dev
   ↓
origin/dev
```

> [!TIP]
> 建立上游跟踪关系后，后续通常可以省略远程仓库名和分支名，直接执行：

```bash
git push
```

或：

```bash
git pull
```

---

---

<a id="upstream"></a>
## 设置和取消上游跟踪关系

### `git branch --set-upstream-to=<remote>/<branch>`

为当前分支设置上游分支。

```bash
git branch --set-upstream-to=origin/master
```

指定本地分支：

```bash
git branch --set-upstream-to=origin/master master
```

---

### `git branch --unset-upstream`

取消当前分支的上游跟踪关系。

```bash
git branch --unset-upstream
```

---

---

<a id="delete-remote"></a>
## 删除远程分支

### `git push <remote> --delete <branch>`

删除远程仓库中的分支。

```bash
git push origin --delete dev
```

执行前：

```text
origin/master
origin/dev
```

执行后：

```text
origin/master
```

---

---

# 6. 过程控制

本节汇总 Merge、Rebase 和 Cherry-pick 在冲突或中断状态下的继续、跳过和取消命令。

---

<a id="merge-control"></a>
## Merge 的继续与取消

### `git merge --abort`

取消当前正在进行的合并。

```bash
git merge --abort
```

适用场景：

- 合并发生冲突
- 不准备继续本次合并

---

### `git merge --continue`

冲突解决并暂存后继续合并。

```bash
git add <file>
git merge --continue
```

部分情况下也可以直接执行：

```bash
git commit
```

完成合并。

---

---

<a id="rebase-control"></a>
## Rebase 的继续、跳过与取消

### `git rebase --continue`

解决冲突并暂存后继续 Rebase。

```bash
git add <file>
git rebase --continue
```

---

### `git rebase --skip`

跳过当前无法应用的提交。

```bash
git rebase --skip
```

> [!WARNING]
> `git rebase --skip` 会跳过当前提交，该提交中的修改不会被应用到新的历史中。

---

### `git rebase --abort`

取消整个 Rebase 操作，并恢复到开始前的状态。

```bash
git rebase --abort
```

---

---

<a id="cherry-pick-control"></a>
## Cherry-pick 的继续与取消

### `git cherry-pick --continue`

解决冲突后继续 Cherry-pick。

```bash
git add <file>
git cherry-pick --continue
```

---

### `git cherry-pick --abort`

取消当前 Cherry-pick。

```bash
git cherry-pick --abort
```

---

---

# 7. 临时保存

本节用于在切换分支、合并或 Rebase 前临时保存尚未提交的工作区修改。

---

<a id="stash"></a>
## Stash

### `git stash`

临时保存当前工作区修改。

```bash
git stash
```

适用场景：

- 当前存在未提交修改，但需要切换分支
- 合并或 Rebase 前临时清理工作区

---

### `git stash push -m <message>`

保存修改并添加说明。

```bash
git stash push -m "WIP: temporary changes"
```

---

### `git stash list`

查看 Stash 列表。

```bash
git stash list
```

---

### `git stash pop`

恢复最近一次 Stash，并将其从 Stash 列表移除。

```bash
git stash pop
```

---
