const { Plugin, PluginSettingTab, Setting } = require('obsidian');

const DEFAULT_SETTINGS = {
  autoReplaceOnPaste: true,
  smartRepairAfterPaste: true,
  repairSingleLetterVariables: true,
  repairBareDisplayMath: true,
};

module.exports = class SmartMathPaste extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.addSettingTab(new SmartPasteSettingTab(this.app, this));

    this.registerEvent(
      this.app.workspace.on('editor-paste', (evt, editor) => {
        if (evt.defaultPrevented) return;
        if (!this.settings.autoReplaceOnPaste) return;

        const plain = evt.clipboardData?.getData('text/plain') || '';
        const html = evt.clipboardData?.getData('text/html') || '';

        // Best case: the browser HTML clipboard still contains the original
        // TeX annotation (common with KaTeX/MathJax). When the selection is
        // essentially one formula, recover that source directly instead of
        // letting rich-text paste fragment the rendered DOM into many lines.
        const htmlMath = this.extractSingleMathFromHtml(html);
        if (htmlMath && this.clipboardIsEssentiallySingleFormula(plain, htmlMath.tex)) {
          evt.preventDefault();
          const tex = this.normalizeDamagedDisplayMath(htmlMath.tex);
          editor.replaceSelection(htmlMath.display ? `$$\n${tex}\n$$` : `$${tex}$`);
          return;
        }

        // Case A: raw LaTeX delimiters survived the copy operation.
        const direct = this.replaceExplicitDelimiters(plain);
        if (direct !== plain) {
          evt.preventDefault();
          editor.replaceSelection(direct);
          return;
        }

        if (!this.settings.smartRepairAfterPaste) return;

        // Case B/C: let Obsidian finish its normal HTML/rich-text -> Markdown
        // conversion first. IMPORTANT: do not decide whether this is math from
        // clipboard text here. The clipboard representation may not contain
        // TeX even though Obsidian's paste converter later produces TeX.
        // Classify the ACTUAL inserted Markdown instead.
        const start = editor.getCursor('from');
        let repairedOnce = false;

        const tryRepair = () => {
          if (repairedOnce) return true;
          try {
            const end = editor.getCursor();
            if (!this.posAfterOrEqual(end, start)) return false;
            const inserted = editor.getRange(start, end);
            if (!inserted) return false;
            if (!this.insertedTextLikelyContainsMath(inserted)) return false;

            const repaired = this.repairDamagedMath(inserted);
            if (repaired === inserted) return false;

            editor.replaceRange(repaired, start, end);
            editor.setCursor(this.advancePosition(start, repaired));
            repairedOnce = true;
            return true;
          } catch (e) {
            console.error('Smart Math Paste repair failed', e);
            return false;
          }
        };

        // The workspace paste event occurs before/around the editor's default
        // paste handling. Retry briefly so we inspect the post-conversion text,
        // not the pre-paste cursor state.
        setTimeout(tryRepair, 0);
        setTimeout(tryRepair, 40);
        setTimeout(tryRepair, 140);
      })
    );

    this.addCommand({
      id: 'smart-repair-selection',
      name: 'Smart repair math in selection',
      editorCallback: (editor) => {
        const selection = editor.getSelection();
        if (!selection) return;
        editor.replaceSelection(this.repairDamagedMath(this.replaceExplicitDelimiters(selection)));
      },
    });

    this.addCommand({
      id: 'smart-repair-document',
      name: 'Smart repair math in document',
      editorCallback: (editor) => {
        const content = editor.getValue();
        editor.setValue(this.repairDamagedMath(this.replaceExplicitDelimiters(content)));
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

  extractSingleMathFromHtml(html) {
    if (!html || typeof DOMParser === 'undefined') return null;
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const annotations = Array.from(doc.querySelectorAll('annotation[encoding="application/x-tex"], annotation[encoding="application/tex"]'));
      if (annotations.length !== 1) return null;
      const node = annotations[0];
      const tex = (node.textContent || '').trim();
      if (!tex) return null;
      const display = !!node.closest('.katex-display, mjx-container[display="true"], math[display="block"], .math-display');
      return { tex, display };
    } catch (e) {
      return null;
    }
  }

  clipboardIsEssentiallySingleFormula(plain, tex) {
    const p = (plain || '').trim();
    if (!p) return true;
    if (/[\u3400-\u9FFF]/.test(p)) return false;
    // A formula-only clipboard can contain both rendered token text and a raw
    // TeX accessibility fallback. Keep this deliberately conservative.
    const commands = (p.match(/\\[A-Za-z]+/g) || []).length;
    const mathSignals = /[_^=<>≤≥≈≠∈]|\\[A-Za-z]+/.test(p);
    const words = (p.match(/[A-Za-z]{4,}/g) || []).length;
    if (p.length <= 1200 && mathSignals && (commands >= 1 || words <= 4)) return true;
    const canonPlain = this.canonicalMathForCompare(p);
    const canonTex = this.canonicalMathForCompare(tex);
    return canonPlain && canonTex && (canonPlain.includes(canonTex) || canonTex.includes(canonPlain));
  }

  repairExistingDisplayBlocks(text) {
    let out = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, body) => {
      let normalizedBody = body.trim();
      if (!normalizedBody) return '$$\n$$';
      if (!/\\[A-Za-z]+|[_^=<>≤≥≈≠∈]/.test(normalizedBody)) return `$$${body}$$`;

      // Rich-text paste often breaks one rendered equation into one token per
      // line. Collapse those visual line breaks back into a TeX expression.
      if (!/\\begin\s*\{/.test(normalizedBody)) {
        normalizedBody = normalizedBody
          .split(/\r?\n/)
          .map(x => x.trim())
          .filter(Boolean)
          .join(' ');
      }
      normalizedBody = this.normalizeDamagedDisplayMath(normalizedBody);
      return `$$\n${normalizedBody}\n$$`;
    });

    // Some browser clipboards contain both a visual/math-accessibility copy
    // and a raw TeX fallback, yielding the same equation twice. If a bare TeX
    // line immediately follows a display block and canonicalizes to the same
    // formula, drop the duplicate.
    out = out.replace(/\$\$\n([\s\S]*?)\n\$\$\s*\n+([^\n]+)(?=\n|$)/g, (all, body, nextLine) => {
      if (!this.looksLikeBareDisplayMath(nextLine.trim())) return all;
      const a = this.canonicalMathForCompare(body);
      const b = this.canonicalMathForCompare(nextLine);
      if (a && b && (a === b || a.includes(b) || b.includes(a))) {
        return `$$\n${body.trim()}\n$$`;
      }
      return all;
    });

    return out;
  }

  canonicalMathForCompare(s) {
    return this.normalizeDamagedDisplayMath(String(s || ''))
      .replace(/^\$\$|\$\$$/g, '')
      .replace(/\s+/g, '')
      .replace(/[()]/g, '')
      .trim();
  }

  insertedTextLikelyContainsMath(text) {
    const s = String(text || '');
    if (!s) return false;

    // Detect the Markdown/TeX that Obsidian actually inserted, rather than
    // guessing from browser clipboard representations.
    if (/\$\$[\s\S]*?\$\$/.test(s)) return true;
    if (/\\[A-Za-z]+/.test(s)) return true;
    if (/[_^](?:[A-Za-z0-9]|\{)/.test(s)) return true;
    if (/(?:={3,}|[≤≥≈≠∈])/.test(s)) return true;

    const stripped = s.match(/\([^()\n]*(?:[_^=<>≤≥≈≠∈]|\\[A-Za-z]+)[^()\n]*\)/g);
    if (stripped && stripped.length >= 1) return true;

    const shortVars = s.match(/\([A-Za-z](?:_[A-Za-z0-9]+)?\)/g);
    return !!(shortVars && shortVars.length >= 2);
  }

  clipboardLikelyContainsMath(plain, html) {
    if (/\\[A-Za-z]+|[_^][A-Za-z0-9{]|\\\(|\\\)|\\\[|\\\]/.test(plain)) return true;
    if (/katex|mathjax|application\/x-tex|<math\b|data-math|math-inline|math-display/i.test(html)) return true;
    const shortVars = plain.match(/\([A-Za-z](?:_[A-Za-z0-9]+)?\)/g);
    return !!(shortVars && shortVars.length >= 2);
  }

  repairDamagedMath(text) {
    // A previous repair pass or Obsidian rich-paste conversion may already
    // have inserted $$ delimiters around a fragmented formula. Normalize
    // those blocks BEFORE protecting existing math, otherwise the broken TeX
    // would be frozen and never repaired.
    text = this.repairExistingDisplayBlocks(text);

    const protectedParts = [];
    const protect = (match) => {
      const token = `\u0000PROTECTED_${protectedParts.length}\u0000`;
      protectedParts.push(match);
      return token;
    };

    // Protect regions that must never be inferred/repaired.
    let work = text
      .replace(/```[\s\S]*?```/g, protect)
      .replace(/`[^`\n]*`/g, protect)
      .replace(/\$\$[\s\S]*?\$\$/g, protect)
      .replace(/\$(?!\$)[^$\n]+?\$/g, protect);

    // Important ordering: recover bare display-math lines first. Otherwise
    // parentheses inside a raw formula such as \\mathrm{AP}_S(B) could be
    // misread as stripped inline math and repaired independently.
    if (this.settings.repairBareDisplayMath) {
      work = this.repairBareDisplayMathLines(work, protect);
    }

    work = this.repairBalancedParentheses(work);

    work = work.replace(/\u0000PROTECTED_(\d+)\u0000/g, (_, n) => protectedParts[Number(n)]);
    return work;
  }

  repairBareDisplayMathLines(text, protect) {
    const lines = text.split('\n');
    return lines.map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.includes('\u0000PROTECTED_')) return line;
      if (!this.looksLikeBareDisplayMath(trimmed)) return line;

      const normalized = this.normalizeDamagedDisplayMath(trimmed);
      const wrapped = `$$\n${normalized}\n$$`;
      // Protect the newly restored display block from later inline repair.
      return protect(wrapped);
    }).join('\n');
  }

  looksLikeBareDisplayMath(s) {
    if (!s || s.length > 800) return false;

    // Avoid normal Markdown/prose structures.
    if (/^(?:#{1,6}\s|[-+*>]\s|\d+[.)]\s|\|)/.test(s)) return false;
    if (/https?:\/\//i.test(s)) return false;
    if (/[\u3400-\u9FFF]/.test(s)) return false; // prose line in CJK

    const commandCount = (s.match(/\\[A-Za-z]+/g) || []).length;
    const hasSubOrSup = /[_^](?:[A-Za-z0-9]|\{)/.test(s);
    const hasRelation = /(?:={1,}|\\(?:ge|le|neq|approx|in|subset|supset)\b|[<>≤≥≈≠∈])/.test(s);
    const hasStructuredCommand = /\\(?:frac|sqrt|sum|prod|min|max|argmin|argmax|mathrm|mathbf|mathbb|operatorname|left|right|varepsilon|epsilon|theta|lambda|mu|sigma)\b/.test(s);

    // Typical standalone equation begins with a math token and contains enough
    // TeX structure to distinguish it from ordinary prose with one backslash.
    const startsMathLike = /^(?:[A-Za-z][A-Za-z0-9]*(?:_[{A-Za-z0-9\\]+\}?|\^[{A-Za-z0-9\\]+\}?)?|\\[A-Za-z]+)/.test(s);

    if (!startsMathLike) return false;
    if (commandCount >= 2 && (hasRelation || hasSubOrSup || hasStructuredCommand)) return true;
    if (hasStructuredCommand && hasRelation) return true;
    if (hasSubOrSup && hasRelation && commandCount >= 1) return true;

    return false;
  }

  normalizeDamagedDisplayMath(s) {
    let out = String(s || '');

    // Browser/HTML clipboard conversions occasionally expand one equality
    // sign into a long run of '=' characters. Collapse only clearly damaged
    // runs (3+) so legitimate == text outside this repair path is untouched.
    out = out.replace(/\s*={3,}\s*/g, ' = ');

    // Restore braces lost from TeX sizing commands.
    out = out.replace(/\\left\s*\{/g, '\\left\\{');
    out = out.replace(/\\right\s*\}/g, '\\right\\}');

    // Tokenized rich paste may insert excessive spacing between commands.
    out = out.replace(/[ \t]+/g, ' ');
    return out.trim();
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
    if (/\\[A-Za-z]+/.test(s)) return true;
    if (/[_^](?:[A-Za-z0-9]|\{)/.test(s)) return true;
    if (/\\[{}]/.test(s)) return true;
    if (/[=<>±×÷∈≤≥≈≠]/.test(s)) return true;
    if (/^[A-Za-z][A-Za-z0-9]*\([^\n]+\)$/.test(s) && /[_^,\\=+\-*/]/.test(s)) return true;
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
      .setName('Smart repair stripped inline math')
      .setDesc('Repair forms such as (x_i), (\\min), (x_i\\in X) and (d(x_i,c)) into inline MathJax.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.smartRepairAfterPaste).onChange(async (value) => {
          this.plugin.settings.smartRepairAfterPaste = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Repair stripped display math')
      .setDesc('Repair standalone raw LaTeX equation lines whose display delimiters were lost during browser copy.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.repairBareDisplayMath).onChange(async (value) => {
          this.plugin.settings.repairBareDisplayMath = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Repair single-letter variables')
      .setDesc('Also convert (X), (C), (K), (c), etc. Useful for math-heavy notes, but may convert ordinary parenthesized single letters.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.repairSingleLetterVariables).onChange(async (value) => {
          this.plugin.settings.repairSingleLetterVariables = value;
          await this.plugin.saveSettings();
        })
      );
  }
}
