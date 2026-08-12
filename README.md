# Smart Math Paste for Obsidian

Fix broken **LaTeX / MathJax formulas** when copying math from **ChatGPT or other AI chat interfaces into Obsidian**.

A formula can look completely correct in the browser, then lose its math delimiters during copy and arrive in Obsidian as plain text. Smart Math Paste repairs that damage automatically when you paste.

## The problem

A rendered inline formula may start as:

```text
\(x_i \in X\)
```

but after normal browser copy it may reach Obsidian as:

```text
(x_i \in X)
```

The expression itself is still there. What disappeared is the information that tells the target editor: **this is math**.

The failure can happen anywhere along this chain:

```text
AI output
→ Markdown / Math rendering
→ Browser
→ Clipboard
→ Obsidian paste
→ MathJax rendering
```

Smart Math Paste focuses on the copy/paste part of that chain.

## What Smart Math Paste does

### 1. Converts surviving LaTeX delimiters

If the copied text still contains LaTeX delimiters:

```text
\(x_i \in X\)
```

Smart Math Paste converts it into Obsidian-compatible inline MathJax:

```text
$x_i \in X$
```

### 2. Repairs formulas whose delimiters were stripped

If browser copy has already reduced the formula to something like:

```text
(x_i \in X)
```

the plugin checks whether the expression strongly resembles damaged math and, when appropriate, restores it as:

```text
$x_i \in X$
```

Typical damaged expressions it can repair include:

```text
(X)
(x_i)
(\lvert C\rvert)
(x_i\in X)
(d(x_i,c))
(\min)
(\max)
```

### 3. Works silently

Paste normally and keep writing.

There are no success pop-ups after every conversion.

```text
Copy
  ↓
Paste
  ↓
Repair
  ↓
Continue writing
```

## Why the original delimiter conversion was not enough

This project grew out of a real debugging case.

A normal LaTeX-to-MathJax converter worked perfectly when given literal source such as:

```text
\(x_i\in X\)
```

That proved the Obsidian plugin, paste listener and MathJax rendering were all working.

The failure appeared only when copying **already-rendered math from the browser**. At that point the clipboard could contain:

```text
(x_i\in X)
```

instead of the original delimiter form.

Once those delimiters are gone, a simple delimiter replacement plugin has nothing left to replace.

Smart Math Paste adds a second recovery layer for that case.

For the full debugging process and the minimal tests used to isolate the problem, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Installation

This version is installed manually.

### 1. Download the repository

Download this repository as ZIP and extract it.

### 2. Create the plugin folder

Inside your Obsidian vault, create:

```text
YOUR_VAULT/.obsidian/plugins/smart-math-paste/
```

If `.obsidian` is hidden, enable hidden files in your file manager.

### 3. Copy these three files

Copy the following files from this repository into the folder above:

```text
main.js
manifest.json
styles.css
```

The final structure should be:

```text
YOUR_VAULT/
└── .obsidian/
    └── plugins/
        └── smart-math-paste/
            ├── main.js
            ├── manifest.json
            └── styles.css
```

### 4. Enable the plugin

Restart Obsidian, then open:

**Settings → Community plugins**

Enable:

**Smart Math Paste**

If another plugin is already intercepting LaTeX paste events, disable it first to avoid duplicate processing.

## Usage

There is no special command required for normal use.

Copy content containing math from an AI chat interface and paste it into Obsidian as usual.

For example, if browser copy turns:

```text
\(x_i\in X\)
```

into:

```text
(x_i\in X)
```

Smart Math Paste can restore the Obsidian source to:

```text
$x_i\in X$
```

and Obsidian will render the formula normally.

## Formatting Prompt

Some formatting failures happen **before copy/paste**, while the LLM is generating Markdown or LaTeX.

Those problems should not be solved by the plugin.

This repository therefore also includes [PROMPT.md](PROMPT.md), a reusable English + Chinese prompt for improving formatting reliability at the generation stage.

It covers:

- inline and display LaTeX
- Markdown tables
- MathJax delimiters
- Markdown / LaTeX nesting
- code blocks
- clipboard compatibility
- Obsidian output
- DOCX / PDF / PPTX formatting checks
- pre-send formatting audits
- root-cause troubleshooting

The two parts have different jobs:

```text
Formatting Prompt
      ↓
reduce generation-time formatting errors
      ↓
browser / clipboard
      ↓
Smart Math Paste
      ↓
repair copy-time damage
      ↓
Obsidian
```

## Troubleshooting

A useful first test is to copy the following **literal source text** and paste it into Obsidian:

```text
\(x_i\in X\)
```

If it becomes:

```text
$x_i\in X$
```

then the basic LaTeX-to-MathJax paste path is working.

If formulas copied from rendered AI responses still fail, the browser clipboard is likely changing the source before Obsidian receives it.

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for the full step-by-step diagnosis.

## Limitations

Smart repair is heuristic.

Once the browser removes the original math delimiters, some information is permanently lost.

For example:

```text
(A)
```

could be a mathematical variable, but it could also be an ordinary label.

No plugin can recover the original intention with perfect certainty after that information has disappeared.

Smart Math Paste therefore tries to repair expressions only when there is enough evidence that they were originally mathematical.

If you find a false positive or a missed formula, please open an issue and include:

- the original content
- what was copied
- what appeared in Obsidian
- what you expected

## Project files

```text
main.js
manifest.json
styles.css
README.md
PROMPT.md
TROUBLESHOOTING.md
LICENSE
```

## Credits

Smart Math Paste is based on the MIT-licensed [Latex2MathJax](https://github.com/aqhours/obsidian-Latex2MathJax) project by Jiong.

The original project provides the LaTeX delimiter conversion foundation. Smart Math Paste extends that workflow with repair for mathematical expressions whose delimiters have already been stripped during browser copy, plus a silent paste workflow.

The original copyright notice is retained in [LICENSE](LICENSE).

## License

MIT License. See [LICENSE](LICENSE).

---

# 中文说明

## Smart Math Paste 是什么

Smart Math Paste 是一个用于 **Obsidian** 的小插件，专门修复从 **ChatGPT 或其他 AI 对话界面复制数学内容**时出现的 LaTeX / MathJax 格式损坏。

一个公式在浏览器里可能完全正常，但复制进入 Obsidian 后，数学定界符已经丢失。

例如原始内容可能是：

```text
\(x_i\in X\)
```

经过浏览器复制以后，Obsidian 实际收到的却可能是：

```text
(x_i\in X)
```

公式本身还在，丢失的是“这段内容属于数学环境”的边界信息。

Smart Math Paste 会在粘贴时尝试恢复这些公式。

## 功能

### 正常定界符转换

如果复制内容中仍然存在：

```text
\(x_i\in X\)
```

插件会转换成 Obsidian 可以直接渲染的：

```text
$x_i\in X$
```

### 修复已经丢失定界符的公式

如果浏览器已经把公式破坏成：

```text
(x_i\in X)
```

插件会根据剩余内容中的数学特征判断它是否可能是被破坏的公式，并在合适时恢复为：

```text
$x_i\in X$
```

常见形式包括：

```text
(X)
(x_i)
(\lvert C\rvert)
(x_i\in X)
(d(x_i,c))
(\min)
(\max)
```

### 静默工作

正常复制，正常粘贴即可。

转换成功后不会反复弹出右上角提示。

## 安装

下载并解压本仓库。

在你的 Obsidian 仓库中建立：

```text
你的仓库/.obsidian/plugins/smart-math-paste/
```

然后把下面三个文件复制进去：

```text
main.js
manifest.json
styles.css
```

最终目录应为：

```text
你的仓库/
└── .obsidian/
    └── plugins/
        └── smart-math-paste/
            ├── main.js
            ├── manifest.json
            └── styles.css
```

重启 Obsidian，然后进入：

**设置 → 第三方插件**

启用：

**Smart Math Paste**

如果已经安装其他会拦截 LaTeX 粘贴事件的插件，建议先关闭，避免重复处理。

## 使用

不需要额外命令。

从 AI 对话界面复制包含数学公式的内容，然后像平时一样粘贴到 Obsidian。

如果浏览器把：

```text
\(x_i\in X\)
```

变成：

```text
(x_i\in X)
```

插件会尝试恢复为：

```text
$x_i\in X$
```

然后由 Obsidian 正常渲染。

## 为什么还有 PROMPT.md

插件解决的是**复制阶段**的问题。

但有些格式错误在 LLM 生成内容时就已经产生，例如：

- LaTeX 定界符错误
- Markdown 表格与数学竖线冲突
- 数学公式被错误放入代码块
- Markdown 与 LaTeX 错误嵌套
- 文档输出后出现裸 LaTeX
- 为了规避错误而把内容拆得过度零散

这些问题应该在生成端解决。

因此本项目同时提供 [PROMPT.md](PROMPT.md)，里面包含可以直接使用的英文版和中文版提示词。

完整思路是：

```text
Formatting Prompt
↓
减少生成阶段的格式错误
↓
浏览器 / 剪贴板
↓
Smart Math Paste
↓
修复复制阶段的公式损伤
↓
Obsidian
```

## 排故过程

这个项目的关键不是“写一个正则表达式”，而是先确认问题究竟出现在哪一层。

实际排查链路是：

```text
LLM 输出
→ Markdown / 数学渲染
→ 浏览器
→ 剪贴板
→ Obsidian paste
→ Obsidian MathJax
```

最关键的最小实验是：

直接复制字面源码：

```text
\(x_i\in X\)
```

如果 Obsidian 能正常把它转换成：

```text
$x_i\in X$
```

就说明 Obsidian、MathJax、插件加载和粘贴监听都没有问题。

这时如果从“已经渲染的 AI 回复”正常复制仍然失败，就应继续检查浏览器剪贴板层，而不是反复修改公式本身。

完整过程见 [TROUBLESHOOTING.md](TROUBLESHOOTING.md)。

## 局限

智能恢复无法做到理论上的百分之百准确。

例如：

```text
(A)
```

既可能表示数学变量，也可能只是普通编号。

如果浏览器已经删除了原始数学定界符，那么部分信息已经永久丢失。插件只能根据剩余文本进行启发式判断。

因此 Smart Math Paste 的目标不是“转换所有括号内容”，而是在数学特征足够明显时进行修复，同时尽量避免修改普通文本。

如果遇到误判或漏判，可以在 GitHub Issues 中提供：

- 原始内容
- 实际复制内容
- Obsidian 中出现的结果
- 预期结果

## 致谢

Smart Math Paste 基于 Jiong 的 MIT 开源项目 [Latex2MathJax](https://github.com/aqhours/obsidian-Latex2MathJax) 修改。

原项目提供了 LaTeX 定界符转换的基础功能；本项目在此基础上增加了浏览器复制后数学定界符丢失的恢复逻辑，并调整为静默粘贴流程。

原项目版权声明保留在 [LICENSE](LICENSE) 中。

## License

MIT License，详见 [LICENSE](LICENSE)。