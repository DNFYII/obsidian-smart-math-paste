# Troubleshooting: Math Formatting Between AI Chat and Obsidian

This document explains the debugging process behind **Smart Math Paste**.

The key lesson is simple:

> A formatting failure is not necessarily caused by incorrect LaTeX. It may occur at any stage between text generation and final rendering.

------

# 1. The Original Problem

Mathematical expressions could render correctly inside an AI chat interface but become broken after being copied into Obsidian.

For example, an inline expression could appear correctly in the chat:

```text
\(x_i \in X\)
```

but after normal browser copy and paste into Obsidian, the resulting text could become:

```text
(x_i \in X)
```

The mathematical content itself was still present, but the math delimiters had disappeared.

As a result, Obsidian no longer recognized the expression as MathJax.

------

# 2. The First Wrong Assumption

The first instinct was to assume that the LaTeX syntax itself was incorrect.

That was only partially true.

Some early formatting problems did come from incorrect interaction between Markdown and LaTeX, such as:

- unsuitable inline math delimiters
- raw LaTeX appearing outside a math environment
- mathematical expressions inside Markdown tables
- vertical bars conflicting with Markdown table separators
- formulas accidentally placed inside code formatting

However, fixing the generated LaTeX did **not** solve the copy-to-Obsidian problem.

This indicated that another layer was involved.

------

# 3. The Rendering Pipeline

The problem became much easier to reason about once the whole process was separated into layers:

```text
LLM generation
      ↓
Markdown parsing
      ↓
Math / MathJax rendering
      ↓
Browser display
      ↓
Browser clipboard conversion
      ↓
Obsidian paste handling
      ↓
Obsidian Markdown / MathJax rendering
```

A failure at any one of these layers can produce a visually similar result.

Therefore, debugging must identify **which layer actually loses the information**.

------

# 4. Problems Found at the Generation Layer

Several output-formatting problems were identified first.

## 4.1 Inline math

For the tested chat environment, inline mathematics rendered reliably using:

```text
\(x_i \in X\)
```

while other delimiter styles could expose raw source depending on the rendering context.

## 4.2 Display math

Display mathematics rendered reliably using:

```text
$$
\min_{C,\ \lvert C\rvert=K}
\max_{x_i\in X}
\min_{c\in C} d(x_i,c)
$$
```

## 4.3 Markdown tables

Markdown tables introduce another parser.

A raw vertical bar may be interpreted as a table-column separator.

Therefore expressions representing cardinality or absolute value should prefer commands such as:

```text
\lvert C\rvert
```

instead of relying on raw vertical bars in sensitive Markdown contexts.

## 4.4 Code blocks

A formula inside a code block is intentionally treated as source code.

Therefore:

```text
\(x_i\)
```

inside a code block should remain visible as source.

A mathematical expression that is supposed to render must not accidentally be placed inside code formatting.

------

# 5. Avoiding Over-Correction

An important debugging mistake was also discovered.

After seeing repeated rendering failures, one possible workaround was to avoid inline LaTeX entirely and place every mathematical symbol in separate display blocks.

That prevented some parser problems, but made the output fragmented and difficult to read.

This was the wrong design direction.

The correct goal is:

```text
correct rendering
+
compact structure
+
good readability
```

not:

```text
avoid all advanced formatting
```

The solution should fix the parsing problem instead of removing useful formatting features.

------

# 6. The Critical Minimal Test

The most important step in the debugging process was a minimal reproduction.

The Obsidian plugin **Latex2MathJax** was installed and automatic paste conversion was enabled.

Normal copying from the rendered chat interface still failed.

A controlled test was then performed.

Instead of copying a rendered formula, the following literal source text was copied from a code block:

```text
\(x_i\in X\)
```

It was pasted directly into Obsidian.

The plugin successfully converted it to:

```text
$x_i\in X$
```

and Obsidian rendered it correctly.

This single test eliminated several possible causes.

It proved that:

- Obsidian MathJax was working.
- The plugin was loaded correctly.
- The paste listener was working.
- The delimiter-conversion logic was working.
- The failure occurred **before the plugin received the text**.

------

# 7. Root Cause

The root cause was the browser clipboard representation produced when copying already-rendered content from the chat interface.

The source might originally contain:

```text
\(x_i\in X\)
```

but the plain-text clipboard representation could become:

```text
(x_i\in X)
```

The mathematical expression survived.

The information identifying it as mathematics did not.

This distinction is essential.

The problem was not:

```text
wrong mathematical expression
```

It was:

```text
lost mathematical boundary information
```

------

# 8. Why the Original Plugin Could Not Fully Solve It

The original delimiter-conversion plugin was designed to transform known LaTeX delimiters.

For example:

```text
\(x_i\)
```

could be converted into:

```text
$x_i$
```

This works when the source delimiters still exist.

But after browser copy, the plugin might receive:

```text
(x_i)
```

At that point there is no explicit delimiter left to convert.

The original plugin cannot reliably know whether:

```text
(x_i)
```

is mathematics or ordinary text.

Therefore simple delimiter replacement is insufficient.

------

# 9. Smart Math Paste

Smart Math Paste adds a second recovery layer.

The processing strategy becomes:

```text
Paste event
    ↓
Are explicit LaTeX delimiters present?
    ├── Yes → perform normal delimiter conversion
    │
    └── No
         ↓
    Does the pasted expression strongly resemble stripped math?
         ├── Yes → reconstruct MathJax delimiters
         └── No  → leave the text unchanged
```

Examples of expressions that may be repaired include:

```text
(X)
(x_i)
(\lvert C\rvert)
(x_i\in X)
(d(x_i,c))
(\min)
(\max)
```

The reconstructed Obsidian form becomes, for example:

```text
$x_i\in X$
```

------

# 10. Why This Is Heuristic

Once the browser has removed the original math delimiters, some information is permanently lost.

For example:

```text
(A)
```

could mean:

- a mathematical variable
- a section label
- an ordinary parenthetical letter

No algorithm can recover the original intention with absolute certainty from the damaged text alone.

Therefore Smart Math Paste uses heuristic detection.

The design principle is:

> Repair expressions when there is strong evidence that they were originally mathematical, while avoiding aggressive modification of ordinary prose.

This is also why potentially ambiguous repairs should remain configurable.

------

# 11. Silent Paste

During testing, successful conversions generated notification messages in the upper-right corner of Obsidian.

These notifications were useful during development but became unnecessary during normal use.

The final workflow therefore removes success notifications while preserving:

- automatic delimiter conversion
- smart repair
- existing-math protection
- code protection

The intended user experience is:

```text
Copy
↓
Paste
↓
Automatically repair
↓
Continue writing
```

with no additional interaction.

------

# 12. The Complete Solution

The final solution uses two defensive layers.

## Layer 1 — Output Formatting Prompt

The prompt reduces formatting errors at the generation stage.

It instructs the LLM to:

- use valid LaTeX environments
- respect Markdown context
- avoid table conflicts
- distinguish inline and display mathematics
- inspect formatting before sending
- diagnose the full rendering pipeline when failures occur

See:

```text
PROMPT.md
```

## Layer 2 — Smart Math Paste

The Obsidian plugin handles failures that the LLM cannot control, especially browser clipboard damage.

Together, the workflow becomes:

```text
LLM
↓
well-formed Markdown / LaTeX
↓
chat rendering
↓
browser clipboard
↓
Smart Math Paste repair
↓
Obsidian Markdown / MathJax
```

------

# 13. General Debugging Method

The debugging method used for this project can be reused for many formatting problems.

When something renders incorrectly:

### Step 1 — Observe the actual failure

Do not infer the source problem from appearance alone.

Inspect what is actually visible.

### Step 2 — Separate the pipeline

Identify all systems that transform the content.

For example:

```text
generator
→ parser
→ renderer
→ clipboard
→ target editor
```

### Step 3 — Construct the smallest possible test

Instead of testing a full document, test one expression.

For example:

```text
\(x_i\in X\)
```

### Step 4 — Bypass one layer at a time

If copying rendered content fails, copy literal source.

If literal source succeeds, the downstream parser is probably not the problem.

### Step 5 — Locate the first point where information changes

The first stage where the content becomes different is usually where the real bug lives.

### Step 6 — Fix only that layer

Avoid changing unrelated parts of the system.

### Step 7 — Re-test the entire workflow

A fix is not complete until the full end-to-end path works.

------

# 14. Key Lessons

The most important lessons from this project are:

1. **Rendered output and source text are not the same thing.**
2. **Clipboard transfer is an active transformation layer, not a transparent pipe.**
3. **Markdown and MathJax are separate parsers and may interact.**
4. **A visually broken formula does not prove the LaTeX itself is wrong.**
5. **Minimal tests are more useful than repeatedly rewriting a large document.**
6. **Fix the failing layer instead of disabling useful functionality.**
7. **Generation-time rules and post-copy repair solve different classes of problems.**
8. **A complete solution must be tested end to end.**

------

# 中文说明

## 问题本质

这个项目最初来自一个非常具体的问题：

AI 对话框中的数学公式显示完全正常，但正常复制到 Obsidian 后，部分行内公式失去数学环境。

例如原始内容可能是：

```text
\(x_i\in X\)
```

经过浏览器正常复制以后，Obsidian 实际收到的却可能是：

```text
(x_i\in X)
```

公式本身没有消失，真正消失的是告诉解析器“这里是一段数学公式”的定界信息。

------

## 完整处理链

真正需要排查的是整条链路：

```text
LLM 生成
↓
Markdown 解析
↓
LaTeX / MathJax 渲染
↓
浏览器显示
↓
浏览器剪贴板转换
↓
Obsidian 粘贴处理
↓
Obsidian Markdown / MathJax 渲染
```

不能看到最终公式坏了，就直接认定是 LLM 的 LaTeX 写错。

------

## 最关键的最小实验

排故中最关键的一步，是绕开 AI 对话框的富文本复制。

直接复制下面的原始源码：

```text
\(x_i\in X\)
```

再粘贴进入 Obsidian。

原版 Latex2MathJax 可以正常把它转换成：

```text
$x_i\in X$
```

这证明：

- Obsidian 没有问题；
- MathJax 没有问题；
- 插件已经正常加载；
- 自动粘贴监听没有问题；
- 转换算法没有问题。

因此真正的故障发生在更前面：

```text
AI 对话框
→
浏览器复制
→
剪贴板
```

------

## 根因

正常复制已经渲染的 AI 回复时，浏览器可能改变剪贴板中的纯文本表示。

原始数学源码：

```text
\(x_i\in X\)
```

可能退化成：

```text
(x_i\in X)
```

因此原插件再也看不到需要转换的数学定界符。

这就是为什么原版插件功能正常，却仍然无法解决实际问题。

------

## Smart Math Paste 的解决方式

Smart Math Paste 在普通定界符转换之外增加了一层智能恢复。

它不仅处理：

```text
\(x_i\)
```

还尝试识别复制后已经退化成：

```text
(x_i)
```

的数学表达式。

例如：

```text
(X)
(x_i)
(\lvert C\rvert)
(x_i\in X)
(d(x_i,c))
(\min)
(\max)
```

在具有充分数学特征时，可以重新补全为 Obsidian 能识别的 MathJax 行内公式。

------

## 为什么无法做到理论上的百分之百准确

如果浏览器已经删除了数学定界符，那么部分原始信息已经永久丢失。

例如：

```text
(A)
```

既可能是数学变量，也可能只是普通编号。

因此智能恢复本质上是启发式判断，而不是无损逆变换。

正确设计目标不是“疯狂转换所有括号内容”，而是：

> 在数学证据充分时自动修复，在语义不明确时尽可能保持原文。

------

## 最终方案

完整方案实际上分成两层。

### 第一层：Prompt

负责尽可能让 LLM 从源头生成正确的 Markdown 和 LaTeX。

### 第二层：Smart Math Paste

负责修复 LLM 无法控制的浏览器复制和剪贴板损伤。

最终链路：

```text
LLM
↓
规范 Markdown / LaTeX
↓
浏览器显示
↓
剪贴板
↓
Smart Math Paste
↓
Obsidian
```

------

## 最重要的排故原则

遇到类似格式问题时，不要不断随机修改格式。

应该：

1. 观察实际故障；
2. 拆分完整处理链；
3. 构造最小测试；
4. 一次绕过一个环节；
5. 找到内容第一次发生变化的位置；
6. 只修真正出错的那一层；
7. 最后重新验证完整端到端链路。

核心思想是：

> **格式问题往往不是单点问题，而是信息经过多层解析、渲染和传输后的链路问题。**