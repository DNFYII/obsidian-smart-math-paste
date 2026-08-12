const { Plugin, PluginSettingTab, Setting } = require('obsidian');

const DEFAULT_SETTINGS = {
  autoReplaceOnPaste: true,
  smartRepairAfterPaste: true,
  repairSingleLetterVariables: true,
};

module.exports = class Latex2MathJaxSmartPaste extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.addSettingTab(new SmartPasteSettingTab(this.app, this));

    this.registerEvent(
      this.app.workspace.on('editor-paste', (evt, editor) => {
        if (!this.settings.autoReplaceOnPaste) return;

        const plain = evt.clipboardData?.getData('text/plain') || '';
        const html = evt.clipboardData?.getData('text/html') || '';

        // Case A: raw LaTeX delimiters survived the copy operation.
        // Replace immediately, matching the behavior of Latex2MathJax.
        const direct = this.replaceExplicitDelimiters(plain);
        if (direct !== plain) {
          evt.preventDefault();
          editor.replaceSelection(direct);
          return;
        }

        if (!this.settings.smartRepairAfterPaste) return;

        // Case B: ChatGPT/browser copy stripped the outer delimiters, e.g.
        // \(x_i\) -> (x_i), \(\min\) -> (\min).
        // Let Obsidian perform its normal HTML->Markdown paste first so tables,
        // headings, bold text, etc. are preserved. Then repair only the text
        // inserted by this paste operation.
        const start = editor.getCursor('from');
        const likelyMathPaste = this.clipboardLikelyContainsMath(plain, html);
        if (!likelyMathPaste) return;

        const tryRepair = () => {
          try {
            const end = editor.getCursor();
            if (!this.posAfterOrEqual(end, start)) return false;
            const inserted = editor.getRange(start, end);
            if (!inserted) return false;
            const repaired = this.repairStrippedInlineMath(inserted);
            if (repaired === inserted) return false;
            editor.replaceRange(repaired, start, end);
            editor.setCursor(this.advancePosition(start, repaired));
            return true;
          } catch (e) {
            console.error('Latex2MathJax Smart Paste repair failed', e);
            return false;
          }
        };

        // Obsidian's rich HTML -> Markdown paste can finish asynchronously.
        // Try shortly after paste, then retry once if nothing was inserted yet.
        setTimeout(() => {
          if (!tryRepair()) setTimeout(tryRepair, 120);
        }, 30);
      })
    );

    this.addCommand({
      id: 'smart-repair-selection',
      name: 'Smart repair ChatGPT math in selection',
      editorCallback: (editor) => {
        const selection = editor.getSelection();
        if (!selection) return;
        editor.replaceSelection(this.repairStrippedInlineMath(this.replaceExplicitDelimiters(selection)));
      },
    });

    this.addCommand({
      id: 'smart-repair-document',
      name: 'Smart repair ChatGPT math in document',
      editorCallback: (editor) => {
        const content = editor.getValue();
        editor.setValue(this.repairStrippedInlineMath(this.replaceExplicitDelimiters(content)));
      },
    });
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  replaceExplicitDelimiters(content) {
    return content
      .replace(/\\\(\s*/g, '$')
      .replace(/\s*\\\)/g, '$')
      .replace(/\\\[\s*/g, '$$$$')
      .replace(/\s*\\\]/g, '$$$$');
  }

  clipboardLikelyContainsMath(plain, html) {
    // Strong LaTeX clues in text/plain.
    if (/\\[A-Za-z]+|[_^][A-Za-z0-9{]|\\\(|\\\)|\\\[|\\\]/.test(plain)) return true;

    // Common math-renderer clues in HTML copied from ChatGPT or other sites.
    if (/katex|mathjax|application\/x-tex|<math\b|data-math|math-inline|math-display/i.test(html)) return true;

    // Rendered ChatGPT copy can reduce \(X\) to (X). If several such short
    // parenthesized tokens exist, treat the paste as likely mathematical.
    const shortVars = plain.match(/\([A-Za-z](?:_[A-Za-z0-9]+)?\)/g);
    return !!(shortVars && shortVars.length >= 2);
  }

  repairStrippedInlineMath(text) {
    // Protect fenced code, inline code, and existing $...$ / $$...$$ math.
    const protectedParts = [];
    const protect = (match) => {
      const token = `\u0000PROTECTED_${protectedParts.length}\u0000`;
      protectedParts.push(match);
      return token;
    };

    let work = text
      .replace(/```[\s\S]*?```/g, protect)
      .replace(/`[^`\n]*`/g, protect)
      .replace(/\$\$[\s\S]*?\$\$/g, protect)
      .replace(/\$(?!\$)[^$\n]+?\$/g, protect);

    work = this.repairBalancedParentheses(work);

    // Restore protected regions.
    work = work.replace(/\u0000PROTECTED_(\d+)\u0000/g, (_, n) => protectedParts[Number(n)]);
    return work;
  }

  repairBalancedParentheses(text) {
    let out = '';
    let i = 0;

    while (i < text.length) {
      if (text[i] !== '(') {
        out += text[i++];
        continue;
      }

      const end = this.findMatchingParen(text, i);
      if (end === -1) {
        out += text[i++];
        continue;
      }

      const inner = text.slice(i + 1, end);
      if (this.looksLikeStrippedMath(inner)) {
        out += '$' + inner.trim() + '$';
      } else {
        // Keep the outer parentheses, but recursively repair nested math.
        out += '(' + this.repairBalancedParentheses(inner) + ')';
      }
      i = end + 1;
    }

    return out;
  }

  findMatchingParen(text, start) {
    let depth = 0;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  looksLikeStrippedMath(raw) {
    const s = raw.trim();
    if (!s || s.length > 160 || /\n/.test(s)) return false;

    // Strong LaTeX indicators.
    if (/\\[A-Za-z]+/.test(s)) return true; // \min, \in, \lvert, \frac, ...
    if (/[_^](?:[A-Za-z0-9]|\{)/.test(s)) return true; // x_i, x^2
    if (/\\[{}]/.test(s)) return true;

    // Typical mathematical relations/operators or function notation.
    if (/[=<>±×÷∈≤≥≈≠]/.test(s)) return true;
    if (/^[A-Za-z][A-Za-z0-9]*\([^\n]+\)$/.test(s) && /[_^,\\=+\-*/]/.test(s)) return true;

    // Single-letter variables are common in ChatGPT-rendered inline math.
    if (this.settings.repairSingleLetterVariables && /^[A-Za-z]$/.test(s)) return true;

    return false;
  }

  posAfterOrEqual(a, b) {
    return a.line > b.line || (a.line === b.line && a.ch >= b.ch);
  }

  advancePosition(start, text) {
    const lines = text.split('\n');
    if (lines.length === 1) return { line: start.line, ch: start.ch + lines[0].length };
    return { line: start.line + lines.length - 1, ch: lines[lines.length - 1].length };
  }
};

class SmartPasteSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Auto convert on paste')
      .setDesc('Convert surviving \\( ... \\) / \\[ ... \\] delimiters on paste.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoReplaceOnPaste).onChange(async (value) => {
          this.plugin.settings.autoReplaceOnPaste = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Smart repair stripped ChatGPT math')
      .setDesc('After normal Obsidian paste, repair forms such as (x_i), (\\min), (x_i\\in X) and (d(x_i,c)) into inline MathJax.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.smartRepairAfterPaste).onChange(async (value) => {
          this.plugin.settings.smartRepairAfterPaste = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Repair single-letter variables')
      .setDesc('Also convert (X), (C), (K), (c), etc. This is useful for copied math-heavy notes but may convert ordinary parenthesized single letters.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.repairSingleLetterVariables).onChange(async (value) => {
          this.plugin.settings.repairSingleLetterVariables = value;
          await this.plugin.saveSettings();
        })
      );
  }
}
