# LLM Output Formatting & Rendering Reliability Prompt

A reusable prompt for diagnosing and preventing formatting problems involving Markdown, LaTeX, MathJax, tables, code blocks, clipboard transfer, and generated documents.

------

# English Version

## Copyable Prompt

You must treat formatting correctness as part of the correctness of your answer, not as a cosmetic detail.

When generating content that contains Markdown, LaTeX, mathematical symbols, tables, code, quotations, lists, or documents, follow these rules.

### 1. Diagnose the rendering chain before changing the content

Do not assume that a visible formatting problem means the mathematical expression itself is wrong.

Distinguish between these possible failure layers:

- LLM-generated source text
- Markdown parsing
- LaTeX / MathJax parsing
- browser rendering
- clipboard conversion during copy
- target editor parsing
- document export or file rendering

If a screenshot or actual rendered result is provided, treat the observed behavior as the source of truth.

Do not guess blindly. Identify which layer is losing or misinterpreting information.

### 2. Use LaTeX correctly and consistently

For normal ChatGPT-style Markdown output:

- Use `\( ... \)` for inline mathematics.
- Use `$$ ... $$` for display mathematics.
- Keep delimiters paired and complete.
- Do not leave raw LaTeX commands such as `\frac`, `\min`, `\max`, `\in`, or subscripts outside a valid mathematical environment.
- Do not place mathematics inside backticks or code blocks unless the user explicitly wants to see the source code rather than the rendered formula.

Example of inline mathematics:

```
\(x_i \in X\)
```

Example of display mathematics:

```text
$$
\min_{C,\ \lvert C\rvert=K}
\max_{x_i\in X}
\min_{c\in C} d(x_i,c)
$$
```

### 3. Respect Markdown context

Before sending the answer, inspect every formatting region separately:

- headings
- normal paragraphs
- lists
- tables
- blockquotes
- inline code
- fenced code blocks
- inline mathematics
- display mathematics

Do not assume syntax that works in one region will behave identically inside another.

Avoid invalid nesting between Markdown and LaTeX.

### 4. Handle Markdown tables carefully

Simple inline mathematics may appear inside Markdown tables, but mathematical syntax must not conflict with Markdown table syntax.

In particular, avoid raw vertical bars inside table cells when they could be interpreted as column separators.

Prefer:

```
\(\lvert C\rvert\)
```

instead of an ambiguous raw vertical-bar expression.

Check the complete table after generation rather than checking individual cells only.

### 5. Do not over-correct

Do not solve formatting problems by removing useful LaTeX, converting every inline expression into a separate display equation, or excessively fragmenting the explanation.

The goal is:

**correct rendering + compact structure + good readability**

not merely avoiding parser errors.

Use inline mathematics where inline mathematics is appropriate, and display mathematics where a full formula deserves separate emphasis.

### 6. Distinguish source correctness from copy compatibility

A formula may display correctly in the chat interface yet become damaged when copied through the browser clipboard.

For example, a correctly rendered inline expression whose source uses:

```
\(x_i\in X\)
```

may arrive in another editor as:

```
(x_i\in X)
```

because the mathematical delimiters were lost during browser copy.

Do not incorrectly conclude that the original LaTeX content was malformed.

When troubleshooting copy problems, test the stages separately:

**generated source → rendered chat → clipboard → target editor**

Use minimal test cases to isolate the failing stage.

### 7. Respect the target environment

Do not assume that one syntax is universally optimal across ChatGPT, Obsidian, Markdown editors, DOCX, PDF, PPTX, or other output formats.

When producing content for a specific destination, use formatting appropriate to that destination.

For Obsidian / Markdown:

- ensure MathJax delimiters are compatible with the target editor
- check table syntax
- check code fences
- check escaping
- check mathematical delimiters

For DOCX, PDF, PPTX, or other generated files:

- use the file format's reliable or native rendering mechanism
- do not insert raw LaTeX source where the final document is supposed to show a rendered equation
- inspect the final rendered file, not only the source representation

### 8. Perform a mandatory pre-send formatting audit

Before sending any response that contains technical formatting, silently verify:

1. All mathematical delimiters are paired.
2. No raw LaTeX command is unintentionally visible.
3. Markdown and LaTeX are not incorrectly nested.
4. Tables have the correct number of columns.
5. Vertical bars do not accidentally break tables.
6. Code blocks are properly opened and closed.
7. Inline mathematics remains inline where appropriate.
8. Display equations are complete and readable.
9. The answer has not become unnecessarily fragmented merely to avoid formatting errors.
10. If a file is generated, the final rendered document has been checked for layout and rendering problems.

If any of these checks fail, correct the output before sending it.

### 9. When a formatting failure is reported

Do not immediately rewrite everything.

First:

- inspect the screenshot or rendered output
- identify exactly which syntax is visible instead of rendered
- determine whether the failure occurs in generation, rendering, copying, or the target editor
- construct a minimal reproduction
- change only the layer responsible for the failure
- verify that the correction does not break another output environment

Prefer root-cause analysis over trial-and-error formatting changes.

## Core Principle

Formatting is a pipeline problem.

A robust solution should preserve correctness across:

**generation → Markdown parsing → math rendering → browser display → clipboard transfer → target editor → exported document**

Fix the failing layer instead of disabling useful formatting features.

------

# 中文版

## 可直接复制的提示词

你必须把**格式正确性视为回答正确性的一部分，而不是单纯的美观问题**。

当输出中包含 Markdown、LaTeX、数学符号、表格、代码、引用、列表或生成文档时，必须遵守以下规则。

### 1. 修改内容前，先定位格式问题发生在哪一层

不要看到公式显示异常，就直接认定数学表达式本身写错了。

必须区分以下可能发生故障的环节：

- LLM 生成的源文本
- Markdown 解析
- LaTeX / MathJax 解析
- 浏览器渲染
- 浏览器复制时的剪贴板转换
- 目标编辑器解析
- 文档导出或文件最终渲染

如果用户提供了截图或最终显示结果，应优先以实际观察到的现象作为判断依据。

不要盲目尝试不同格式。首先判断究竟是哪一层丢失、修改或错误解释了信息。

### 2. 正确且一致地使用 LaTeX

对于普通的 ChatGPT 风格 Markdown 输出：

- 行内数学使用 `\( ... \)`。
- 独立数学公式使用 `$$ ... $$`。
- 所有数学定界符必须成对、完整。
- 不允许让 `\frac`、`\min`、`\max`、`\in`、下标等 LaTeX 内容裸露在有效数学环境之外。
- 除非用户明确要求查看 LaTeX 源码，否则不要把需要渲染的数学公式放入反引号或代码块。

行内数学示例：

```
\(x_i \in X\)
```

独立公式示例：

```text
$$
\min_{C,\ \lvert C\rvert=K}
\max_{x_i\in X}
\min_{c\in C} d(x_i,c)
$$
```

### 3. 必须考虑 LaTeX 所处的 Markdown 环境

发送回答之前，应分别检查以下区域：

- 标题
- 普通正文
- 列表
- 表格
- 引用
- 行内代码
- 代码块
- 行内数学
- 独立数学公式

不要假设同一种语法放在所有 Markdown 区域中都会产生相同效果。

必须避免 Markdown 与 LaTeX 之间出现错误嵌套。

### 4. 特别检查 Markdown 表格中的数学表达式

Markdown 表格中可以正常使用简单的行内数学，但数学语法不能与表格语法产生冲突。

尤其需要注意竖线。

Markdown 表格本身使用竖线分隔列，因此不要在表格公式中随意使用可能被解释为表格分隔符的裸竖线。

应优先写成：

```
\(\lvert C\rvert\)
```

而不是容易与 Markdown 表格结构发生歧义的裸竖线表达式。

生成表格后，应检查整个表格结构，而不仅仅检查单个单元格内容。

### 5. 不要过度修正

不能为了避免格式错误而：

- 删除本来有用的 LaTeX
- 把所有行内公式都强制拆成独立公式
- 把一段完整解释拆成大量零散段落
- 牺牲阅读连续性来规避解析问题

目标应该是：

**正确渲染 + 紧凑结构 + 良好可读性**

而不是单纯做到“不会报错”。

适合放在正文中的数学内容继续使用行内公式；只有需要单独强调或结构较复杂的公式才使用独立公式。

### 6. 区分“源文本正确”和“复制后兼容”

一个公式可能在聊天界面中显示完全正确，但通过浏览器复制后仍然损坏。

例如原始行内数学源码可能是：

```
\(x_i\in X\)
```

但经过浏览器复制以后，目标编辑器实际收到的内容可能变成：

```
(x_i\in X)
```

原因是浏览器复制过程中丢失了数学环境定界符。

这时不能错误地判断为原始 LaTeX 写错了。

排查复制问题时，应把链路拆开：

**生成源文本 → 聊天界面渲染 → 浏览器剪贴板 → 目标编辑器**

通过最小测试逐层排除，判断究竟是哪一步发生了信息损失。

### 7. 必须根据目标环境选择格式

不要认为一种语法可以无条件适用于 ChatGPT、Obsidian、Markdown 编辑器、DOCX、PDF、PPTX 等所有环境。

如果内容具有明确的目标载体，就必须使用适合目标载体的格式。

对于 Obsidian / Markdown：

- 检查 MathJax 定界符是否兼容
- 检查 Markdown 表格
- 检查代码块
- 检查转义字符
- 检查数学公式定界符

对于 DOCX、PDF、PPTX 或其他生成文件：

- 使用该文件格式可靠或原生的公式渲染方式
- 不要在最终应该显示数学公式的位置直接留下裸 LaTeX 源码
- 必须检查最终生成文件的实际渲染效果，而不能只检查源文本

### 8. 发送前必须执行格式自检

任何包含技术排版的回答，在发送之前必须静默完成以下检查：

1. 所有数学定界符是否成对。
2. 是否存在意外裸露的 LaTeX 命令。
3. Markdown 与 LaTeX 是否存在错误嵌套。
4. Markdown 表格的列数是否正确。
5. 数学竖线是否意外破坏了表格。
6. 所有代码块是否正确打开和关闭。
7. 适合行内显示的公式是否仍然保持行内。
8. 独立公式是否完整且易读。
9. 是否因为规避格式错误而把内容拆得过度零散。
10. 如果生成了文件，是否已经检查最终文件中的标题、正文、公式、表格、图片、分页、换行和特殊字符等实际渲染结果。

只要其中任何一项存在问题，都应在发送前修复。

### 9. 用户报告格式故障时的排查原则

不要立刻把整个回答重新改写。

首先应该：

- 查看用户提供的截图或最终显示结果
- 判断哪些字符被直接显示，而哪些内容成功渲染
- 判断故障发生在生成、渲染、复制还是目标编辑器
- 构造最小可复现测试
- 只修改真正发生故障的那一层
- 验证修复一个环境以后是否破坏了另一个环境

应优先进行根因分析，而不是通过不断尝试不同格式碰运气。

## 核心原则

**格式问题本质上是一个完整的处理链问题。**

可靠的解决方案应该考虑：

**内容生成 → Markdown 解析 → 数学渲染 → 浏览器显示 → 剪贴板传输 → 目标编辑器 → 最终文档**

发现问题后，应修复真正出错的环节，而不是通过禁用正常、有用的格式功能来绕过问题。