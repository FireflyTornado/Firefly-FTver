---
title: 从文件共享到蠕虫风暴：TCP 445 端口的前世与今生
description: 445 端口？永恒之蓝？从 NetBIOS 与 SMB 的早期时代，到 Conficker、EternalBlue、WannaCry，再到现代 SMB 签名、加密与 NTLM 防护：回顾 TCP 445 端口二十余年的变迁。
published: 2026-09-19
tags: [网安, 漏洞]
category: 学习
---

如果你曾经查看过服务器的防火墙日志、安全组记录，或者接触过 Windows 文件共享，那么大概率见过一个非常醒目的端口：

```text
TCP 445
```

在很多网络安全文章里，445 几乎总是伴随着“高危”“永恒之蓝”“勒索病毒”“不要开放公网”等关键词出现，令人谈虎色变。久而久之，很多人逐渐产生了一种刻板印象：**445 端口本身就是一个漏洞。**

但事实并非如此。

 **445 端口本身并不是漏洞。** 真正需要关注的是运行在它之上的 SMB 服务，以及 SMB、Windows Server Service、RPC、NTLM 等组件中曾经出现的漏洞与配置风险。

从早期 Windows 局域网中的文件共享，到 2008 年的 Conficker，再到 2017 年震动全球的 WannaCry 与 NotPetya，445 几乎见证了 Windows 网络安全从“局域网互信”走向“默认不信任”的整个过程。

> [!NOTE]
> 本文讨论的是漏洞历史、安全机制与防御思路，不提供漏洞利用代码、攻击载荷或实际入侵步骤。

---

# 从 NetBIOS 到 TCP 445：SMB 是如何走到这里的

TCP 445 最常见的用途，是承载 **SMB 协议**。SMB 是 Windows 网络中非常核心的一种协议，主要负责文件共享、文件服务器访问、网络打印机共享、远程共享目录访问，以及一部分远程管理和域环境通信。

例如，在 Windows 资源管理器里输入：

```text
\\192.168.1.10\share
```

背后通常就是 SMB 在工作。

不过，SMB 并不是从一开始就直接运行在 445 端口上的。早期 Windows 网络大量依赖 **NetBIOS over TCP/IP（NetBT）**，SMB 通常通过 NetBIOS 会话服务传输，因此会看到一组经典端口：

| 端口 | 协议 | 常见用途 |
| --- | --- | --- |
| UDP 137 | NetBIOS Name Service | 名称解析 |
| UDP 138 | NetBIOS Datagram Service | 数据报服务 |
| TCP 139 | NetBIOS Session Service | 会话与 SMB |
| TCP 445 | Direct-hosted SMB | SMB 直接运行于 TCP |

随着 Windows 2000 时代的到来，微软开始广泛使用 **Direct-hosted SMB**：

```text
SMB
 ↓
TCP
 ↓
445
```

这意味着 SMB 不再必须依赖 TCP 139，而可以直接运行在 TCP 445 上。从网络结构上看，这是一次简化；但从安全角度看，445 也由此逐渐成为 Windows 网络服务中最重要、最敏感的入口之一。

很多人第一次接触 SMB 时，会把它理解成单纯的“传文件协议”。实际上，Windows 对 SMB 的使用远不止文件共享。SMB 还可以承载 **命名管道（Named Pipe）**，而部分 Windows RPC 服务又可以通过命名管道工作。

可以粗略理解为：

```text
TCP 445
   │
   ▼
  SMB
   │
   ├── 文件共享
   ├── 打印共享
   ├── IPC$
   ├── Named Pipe
   │      │
   │      └── RPC
   │
   └── 身份认证
```

这也是为什么历史上一些看起来属于“RPC”或“Server Service”的漏洞，最终仍然经常与 139/445 联系在一起。

更重要的是，SMB 诞生和成长的年代与今天的网络安全环境完全不同。早期企业网络通常更强调局域网内的资源互通，内部网络往往被默认视为相对可信；而今天的安全理念则越来越接近“任何网络连接都需要验证”。这种设计时代的差异，后来成为许多安全问题的重要背景。

---

# 2008：MS08-067 与 Conficker，445 开始成为“蠕虫入口”的代名词

在 445 的安全历史中，2008 年是一个无法绕开的时间点。

2008 年 10 月 23 日，微软发布安全公告 **MS08-067**，修复了 Windows Server Service 中的一个远程代码执行漏洞：

**CVE-2008-4250**

漏洞位于 Windows Server Service 对特制 RPC 请求的处理中。在部分 Windows 2000、Windows XP 与 Windows Server 2003 系统上，未经身份认证的攻击者可能通过网络触发内存破坏并获得远程代码执行能力。

攻击链可以简化为：

```text
无需身份认证
    ↓
发送特制 RPC 请求
    ↓
触发内存破坏
    ↓
远程执行代码
```

微软当时已经明确指出，这个漏洞可能被制作成蠕虫化攻击。很快，这个判断就成为现实。

2008 年末，著名的 **Conficker** 蠕虫开始大规模传播。它利用的核心漏洞之一，正是 MS08-067。

```text
感染主机 A
    │
    ├── 扫描其他 Windows 主机
    ├── 发现可达服务
    ├── 尝试利用 MS08-067
    │
    ▼
感染主机 B
    │
    └── 再次扫描
           ↓
      感染 C、D、E……
```

Conficker 与传统依赖邮件附件或用户点击的恶意软件有一个非常明显的区别：**它不需要每一台机器上的用户都主动做错一件事。** 只要目标系统存在漏洞，同时网络路径可达，就有机会被自动传播。

这正是网络蠕虫最危险的地方。

Conficker 并不是第一个网络蠕虫，但它再次证明了一个后来反复出现的事实：局域网里的基础服务一旦出现可远程利用、又适合自动传播的漏洞，一台失陷主机就可能迅速演变成整个网段的问题。从这个阶段开始，139/445 在企业防火墙和边界策略中的地位也越来越敏感。

与此同时，SMB 本身也在继续演进：

```text
SMB 1.0
  ↓
SMB 2.0
  ↓
SMB 2.1
  ↓
SMB 3.0
  ↓
SMB 3.02
  ↓
SMB 3.1.1
```

其中，**SMBv1** 是历史最悠久、兼容包袱也最沉重的版本。它的问题并不在于“只要使用 SMBv1 就一定会被攻击”，而是它设计年代久远、协议复杂、长期维护成本高，而且缺乏后来 SMB 版本拥有的许多现代安全能力。

在相当长的一段时间里，Windows 为了兼容旧设备和旧网络环境仍然保留 SMBv1。到了 2017 年，这种兼容策略终于遭遇了代价极高的一次集中爆发。

---

# 2017：MS17-010、EternalBlue 与 Shadow Brokers

2017 年 3 月 14 日，微软发布了后来极其著名的安全公告：

**MS17-010**

它修复的是一组 Windows SMB Server 漏洞，其中最严重的问题可使攻击者通过向 SMBv1 服务发送特制消息来实现远程代码执行。

这是理解后续事件最关键的时间节点之一。因为后来席卷全球的灾难，并不是发生在“微软还不知道漏洞存在”的时候，而是在补丁已经发布之后。

> [!TIP]
> **补丁“已经发布”不等于风险“已经消失”。** 只有补丁真正部署到受影响的系统上，漏洞带来的风险才会实质下降。2017 年后续发生的 WannaCry，正是这一点最典型的案例之一。

说到这里，就必须解释另一个常被混淆的名词：**EternalBlue（永恒之蓝）**。

网络上经常可以看到“445 端口存在永恒之蓝漏洞”这样的说法，虽然方便理解，但技术上并不严谨。更准确的关系应该是：

```text
TCP 445
    ↓
SMB 服务
    ↓
SMBv1 实现漏洞
    ↓
MS17-010 修复
    ↓
EternalBlue 等利用技术
```

> [!NOTE]
> 这里最容易混淆四个概念：**445 是端口，SMB 是协议，MS17-010 是微软针对一组 SMB 漏洞发布的安全更新，而 EternalBlue 是针对其中漏洞的利用技术之一。** 因此，“445 端口就是永恒之蓝漏洞”并不是一个严谨的说法。

EternalBlue 通常与 **CVE-2017-0144** 联系在一起。它危险的地方在于，攻击者并不是简单地猜用户名和密码，而是在尝试攻击 SMB 协议实现本身。因此，即使账户密码非常复杂，也无法替代系统补丁。

2017 年 4 月，事情进一步恶化。名为 **Shadow Brokers** 的组织公开了一批攻击工具，其中包含：

- EternalBlue；
- EternalRomance；
- EternalChampion；
- EternalSynergy。

这些工具与 Windows SMB 漏洞密切相关。

整个局势于是变成：

```text
2017-03-14
Microsoft 发布 MS17-010
        ↓
2017-04
Shadow Brokers 公开相关攻击工具
        ↓
攻击能力迅速扩散
```

原本掌握在少数人手中的高级攻击能力，一旦被公开，就意味着全世界都可以开始研究、修改和集成它。而此时，仍有大量 Windows 机器没有完成更新。

一场灾难正在酝酿。

---

# WannaCry 与 NotPetya：445 从此“恶名昭彰”

2017 年 5 月 12 日，**WannaCry / WannaCrypt** 大规模爆发。

它真正令人恐惧的地方，并不只是“勒索”，而是把 **勒索软件** 与 **网络蠕虫** 结合到了一起。

传统勒索软件往往更依赖用户交互，例如：

```text
邮件附件
   ↓
用户点击
   ↓
恶意程序运行
   ↓
文件被加密
```

而 WannaCry 获得 SMB 蠕虫传播能力之后，传播过程变成了：

```text
一台机器感染
      ↓
扫描其他可达主机
      ↓
寻找存在漏洞的 SMBv1
      ↓
利用漏洞传播
      ↓
新的机器感染
      ↓
继续扫描
```

这意味着病毒不需要等待每一个用户主动犯错。一旦进入一个防护薄弱、机器补丁状态又不一致的局域网，它就可能自行扩散。

更值得注意的是时间差：

| 事件 | 日期 |
| --- | --- |
| MS17-010 发布 | 2017-03-14 |
| WannaCry 大规模爆发 | 2017-05-12 |

两者之间已经过去了接近两个月。

> [!NOTE]
> WannaCry 留下的一个经典教训是：**补丁存在，并不代表补丁已经真正进入生产环境。** 漏洞修复、补丁分发、终端实际完成更新，是三个不同的环节。

然而，2017 年关于 SMB 的故事还没有结束。

仅仅一个多月后，**NotPetya** 再次爆发。它表面上看起来像勒索软件，但后来更多被视为一种高度破坏性的恶意软件。与 WannaCry 相比，NotPetya 的传播方式更加复杂，它并不只依赖单一 SMB 漏洞，而是组合使用了：

- EternalBlue；
- EternalRomance；
- SMB；
- 被窃取的凭据；
- PsExec；
- WMIC；
- Windows 管理机制。

它的传播逻辑更接近：

```text
目标存在 SMB 漏洞？
        │
    ┌───┴───┐
   YES      NO
    │        │
漏洞传播    是否掌握有效凭据？
             │
          ┌──┴──┐
         YES    NO
          │
       使用合法
       管理机制
       横向移动
```

> [!NOTE]
> NotPetya 把问题又向前推进了一步：**系统已经打补丁，并不等于整个网络已经安全。** 一旦管理员凭据被窃取，攻击者仍可能借助合法的远程管理机制继续横向移动。

如果攻击者已经获得管理员凭据，那么即使某台机器不存在对应漏洞，也可能通过正常的远程管理能力继续横向移动。于是安全问题不再只是“有没有漏洞”，而开始扩展到凭据、权限、网络隔离、最小权限和服务暴露范围。

从这一点开始，445 的安全史也从“单纯修漏洞”逐渐进入现代安全体系的阶段。

---

# 从淘汰 SMBv1 到 SMBGhost：协议升级并不等于绝对安全

经过 2017 年的一系列事件后，SMBv1 的风险已经无法继续被忽视。微软开始更积极地推动 SMBv1 退出历史舞台，现代 Windows 系统逐渐默认不安装 SMBv1，并推荐使用 SMB2 / SMB3 以及更严格的身份认证、签名和加密机制。

但这并不意味着“只要使用 SMB2 或 SMB3 就绝对安全”。

2020 年，Windows SMBv3 又出现了一个广受关注的漏洞：

**CVE-2020-0796，也就是 SMBGhost。**

该漏洞与 SMB 3.1.1 的压缩功能有关。它的出现再次提醒人们：**淘汰旧协议只是降低风险，并不能让整个协议族从此不存在漏洞。**

真正可靠的安全思路始终应该是多层防护：

- 使用现代协议；
- 及时安装系统更新；
- 限制服务暴露范围；
- 做好访问控制；
- 对内网进行合理隔离。

因此，445 的安全演进并不是“SMBv1 很危险，换成 SMB3 就结束了”，而是从旧协议问题逐渐转向更加系统化的身份认证、完整性保护与横向移动防护。

---

# 现代 445：风险重点从远程代码执行转向认证与横向移动

今天再讨论 445，还是只能想到 EternalBlue 吗？——它已经是将近十年前的东西了。

在一个及时更新的现代 Windows 网络中，更现实的风险通常包括 NTLM Relay、凭据窃取、弱密码、错误的共享权限、SMB Signing 未启用、匿名或 Guest 访问、横向移动，以及第三方 NAS 或 Samba 的实现漏洞。

攻击者关心的问题，也逐渐从“有没有一个能直接打穿系统的 SMB 漏洞”，变成了“能不能利用 SMB 扩大已经获得的权限”。

其中很典型的一类问题，就是 **NTLM Relay**。

正常情况下，客户端可能向服务器发起 NTLM 身份认证：

```text
客户端 A
   │
   │ NTLM Authentication
   ▼
服务器 B
```

而在某些不安全的配置下，攻击者可能尝试把一次认证过程转发给另一个服务：

```text
客户端 A
    │
    ▼
攻击者
    │
    │ Relay
    ▼
服务器 B
```

这里的关键在于，攻击者并不一定需要知道用户的明文密码，而是试图利用一段正在发生的认证过程。

因此，NTLM Relay 和 EternalBlue 本质上是两类完全不同的问题：前者主要与身份认证和配置有关，后者属于软件漏洞与远程代码执行。

为了降低这类风险，现代 Windows 不断强化 **SMB Signing、Kerberos、NTLM 限制以及更严格的默认策略**。

## SMB Signing 与 SMB Encryption

**SMB Signing（SMB 签名）** 可以理解为给 SMB 消息附加一个基于会话密钥计算的签名，用于验证数据在传输过程中是否被篡改。

```text
原始消息
  ↓
攻击者修改
  ↓
签名验证失败
  ↓
拒绝
```

它能够显著降低消息篡改、中间人攻击以及一部分 SMB Relay 风险。

而 **SMB Encryption（SMB 加密）** 解决的是另一个问题：数据内容是否会被旁观者直接读取。简单来说，签名更强调完整性与真实性，加密则进一步保护内容机密性。

现代 Windows 还逐步加入或强化了：

- 更严格的 SMB Signing 策略；
- SMB Encryption；
- NTLM Blocking；
- SMB Authentication Rate Limiter；
- 更现代的签名算法；
- 更严格的防火墙和访问策略。

445 端口依旧存在，但今天运行在它上面的 SMB，与二十年前已然不可同日而语。

---

# 为什么今天仍然不建议把 445 直接暴露到公网？

看到这里，可能有人想问：既然现代 SMB 已经拥有 SMB3、签名、加密和更严格的认证机制，为什么仍然普遍不建议把 445 直接暴露到公网？

原因其实很简单：**没有必要承担的攻击面，就不应该承担。**

如果结构是：

```text
Internet
   ↓
公网 IP:445
```

那么意味着整个互联网都可以尝试与你的 SMB 服务建立连接。

即使系统已经完全更新，仍然要面对自动化端口扫描、SMB 指纹识别、用户名与服务枚举、密码爆破、NTLM 相关攻击、配置错误、第三方实现漏洞，以及可能尚未公开的新漏洞。

对于绝大多数个人服务器和企业服务器而言，并没有充分的理由或者必要性让整个互联网直接访问 SMB。更合理的结构通常是：

```text
Internet
   ↓
VPN / WireGuard / Tailscale
   ↓
可信内部网络
   ↓
TCP 445 / SMB
```

> [!TIP]
> **不要把“系统目前没有已知漏洞”等同于“这个服务适合直接暴露公网”。** 对于没有公网访问必要的 SMB 服务，减少暴露面本身就是最直接、最有效的防护之一。

---

# 今天看到“有人扫描我的 445”，意味着什么？

如果你在服务器日志、安全组日志或防火墙里看到陌生 IP 不断访问 445，并不能直接得出“有人正在用永恒之蓝攻击我”这样的结论。

更准确地说，这通常只说明：**有主机正在探测你的 445 端口，确认这里是否存在 SMB 服务，以及是否值得继续识别。**

互联网中存在大量自动化扫描系统，它们可能同时扫描很多常见端口，例如：

```text
22
23
80
443
445
3389
6379
9200
27017
……
```

445 只是其中极受关注的一个。

扫描者可能寻找的是老旧 Windows、SMBv1、Samba、NAS、弱口令、匿名共享、错误配置，也可能是在寻找新出现的漏洞。

因此需要区分三件事：

- **445 被扫描**，不等于有人还在尝试使用 EternalBlue 等等攻击你；
- **445 被扫描**，不等于攻击已经成功；
- **445 被扫描**，甚至不等于你的服务器真的开放了 445。

如果防火墙或云安全组已经正确阻断，那么扫描往往就只会停留在扫描本身。

---

# 445 的历史真正留下了什么？

如果最后只把这段历史总结成“445 很危险，所以关掉它”，其实反而会错过其中最有价值的部分。

445 与 SMB 的二十多年安全史，真正留下的是几条非常现代的安全原则。

首先，**补丁必须真正“部署”，而不是仅仅“发布”**。WannaCry 最经典的地方，就在于 MS17-010 早已发布，但仍有大量系统没有及时更新。

其次，**内网并不天然安全**。Conficker、WannaCry、NotPetya 都展示过同一种模式：

```text
攻击进入一台机器
      ↓
局域网内部横向传播
      ↓
整个网络受到影响
```

> [!NOTE]
> **“内网”与“可信网”从来都不是同义词。** Conficker、WannaCry 与 NotPetya 都说明，一旦攻击者进入内部网络，横向传播往往比最初的入口本身更值得警惕。

第三，**密码安全与漏洞修复不能相互替代**。复杂密码挡不住无需认证的远程代码执行漏洞，而系统补丁也解决不了凭据泄露、弱密码和错误权限配置。

第四，**减少服务暴露本身就是一种安全措施**。如果服务器根本不需要 SMB，那么关闭服务或限制访问范围，通常比长期把它暴露在公网再依赖各种规则补救更加可靠。

最后，也是最重要的一点：Windows 网络安全设计正在从“为了兼容，尽可能允许连接”，逐渐转向“**为了安全，连接必须证明自己可信**”。

从 SMBv1 到 SMB3，从可选签名到更严格的签名要求，从 NTLM 到 Kerberos，从裸露服务到 VPN 与零信任架构，这种变化贯穿了整个 445 的历史。

---

# 一张时间线看完 445 的前世今生

最后，可以把这二十多年的变化压缩成一条时间线：

```text
早期 Windows
│
├── SMB over NetBIOS
│      └── TCP 139
│
├── Direct-hosted SMB
│      └── TCP 445
│
▼
2008
MS08-067
│
├── 远程代码执行
│     │
│     ▼
│  Conficker
│     │
│     └── 大规模网络蠕虫
│
▼
SMB2 / SMB3 持续发展
│
▼
2017-03-14
MS17-010 发布
│
▼
2017-04
Shadow Brokers 泄露攻击工具
│
├── EternalBlue
├── EternalRomance
├── ...
│
▼
2017-05
WannaCry
│
├── 勒索软件 + SMB 蠕虫
│
▼
2017-06
NotPetya
│
├── SMB 漏洞
├── 凭据
├── Windows 管理工具
│
▼
SMBv1 加速退出历史舞台
│
▼
2020
SMBGhost
│
├── SMB 3.1.1 漏洞
│
▼
现代 Windows
│
├── SMB 3.x
├── SMB Signing
├── SMB Encryption
├── Kerberos
├── NTLM Blocking
├── Authentication Rate Limiter
└── 更严格的默认安全策略
```

从某种意义上说，445 从来没有“变成一个危险端口”。真正发生变化的，是它所处的网络环境，以及我们对网络信任的理解。

二十年前，SMB 更多被看作局域网里的基础工具；到了 2008 年，它开始频繁出现在蠕虫传播的讨论中；2017 年，EternalBlue、WannaCry 和 NotPetya 又让 445 成为了网络安全史上最具辨识度的端口之一；而到了今天，SMB 本身已经拥有远比过去完善的安全机制，但安全策略反而变得更加谨慎。

**能不暴露，就不要暴露；能隔离，就不要直接互通；能使用现代认证，就不要继续依赖历史兼容机制。**

也许这才是 445 端口二十多年历史里最值得记住的东西。

---

# 参考资料

本文主要参考 Microsoft 官方安全公告与技术文档：

1. Microsoft Security Bulletin MS08-067 — Vulnerability in Server Service Could Allow Remote Code Execution  
   <https://learn.microsoft.com/en-us/security-updates/securitybulletins/2008/ms08-067>

2. Microsoft Security Bulletin MS17-010 — Security Update for Microsoft Windows SMB Server  
   <https://learn.microsoft.com/en-us/security-updates/securitybulletins/2017/ms17-010>

3. Microsoft Security Blog — WannaCrypt ransomware worm targets out-of-date systems  
   <https://www.microsoft.com/en-us/security/blog/2017/05/12/wannacrypt-ransomware-worm-targets-out-of-date-systems/>

4. Microsoft Security Blog — New ransomware, old techniques: Petya adds worm capabilities  
   <https://www.microsoft.com/en-us/security/blog/2017/06/27/new-ransomware-old-techniques-Petya-adds-worm-capabilities/>

5. Microsoft Learn — SMB security hardening in Windows Server and Windows Client  
   <https://learn.microsoft.com/en-us/windows-server/storage/file-server/smb-security-hardening>

6. Microsoft Learn — Control SMB signing behavior  
   <https://learn.microsoft.com/en-us/windows-server/storage/file-server/smb-signing>

7. Microsoft Learn — SMB Security Enhancements  
   <https://learn.microsoft.com/en-us/windows-server/storage/file-server/smb-security>

---

> [!TIP]
> 如果你是在公网服务器的安全日志里第一次注意到 445，最重要的并不是去判断每一个扫描 IP 究竟在运行什么工具，而是先确认：**你的服务器是否真的有必要向公网提供 SMB，以及防火墙或安全组是否已经阻止了不必要的访问。**
