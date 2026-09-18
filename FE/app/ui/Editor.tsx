"use client";

import { useEffect, useRef, useState } from "react";
import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import { Check, Copy, Minus, Plus, WrapText } from "lucide-react";

function getMonacoLanguage(language: string) {
  const normalizedLanguage = language.toLowerCase();

  if (normalizedLanguage.startsWith("python")) return "python";
  if (normalizedLanguage.startsWith("javascript")) return "javascript";
  if (normalizedLanguage.startsWith("typescript")) return "typescript";
  if (normalizedLanguage.startsWith("c++")) return "cpp";
  if (normalizedLanguage.startsWith("c#")) return "csharp";
  if (normalizedLanguage.startsWith("php")) return "php";
  if (normalizedLanguage.startsWith("java")) return "java";
  if (normalizedLanguage.startsWith("go")) return "go";

  return normalizedLanguage;
}

function defineGoCodeTheme(monaco: Monaco) {
  monaco.editor.defineTheme("gocode-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "71717A", fontStyle: "italic" },
      { token: "keyword", foreground: "5EEAD4" },
      { token: "string", foreground: "FCD34D" },
      { token: "number", foreground: "FDA4AF" },
    ],
    colors: {
      "editor.background": "#09090B",
      "editor.lineHighlightBackground": "#FFFFFF0A",
      "editorLineNumber.foreground": "#52525B",
      "editorLineNumber.activeForeground": "#E4E4E7",
      "editorCursor.foreground": "#34D399",
      "editor.selectionBackground": "#34D39933",
      "editor.inactiveSelectionBackground": "#34D3991F",
      "editorIndentGuide.background1": "#27272A",
      "editorIndentGuide.activeBackground1": "#3F3F46",
      "editorWidget.background": "#18181B",
      "editorWidget.border": "#27272A",
      "editorSuggestWidget.selectedBackground": "#34D39926",
      "editorHoverWidget.background": "#18181B",
      "editorHoverWidget.border": "#27272A",
      "editorGutter.background": "#09090B",
      "scrollbarSlider.background": "#27272A80",
      "scrollbarSlider.hoverBackground": "#3F3F4680",
    },
  });
}

export default function CodeEditor({
  code,
  language,
  onChange,
  onRun,
  height = "60vh",
}: {
  code: string;
  language?: string;
  onChange?: (value?: string) => void;
  /** Gọi khi bấm Ctrl/Cmd + Enter */
  onRun?: () => void;
  height?: string;
}) {
  const [fontSize, setFontSize] = useState(14);
  const [wordWrap, setWordWrap] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const onRunRef = useRef(onRun);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onRunRef.current = onRun;
  }, [onRun]);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const handleMount: OnMount = (editor, monaco) => {
    const cursorListener = editor.onDidChangeCursorPosition((event) => {
      setCursor({
        line: event.position.lineNumber,
        column: event.position.column,
      });
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      onRunRef.current?.();
    });
    return () => cursorListener.dispose();
  };

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard không khả dụng (http không bảo mật...) thì bỏ qua
    }
  }

  const monacoLanguage = getMonacoLanguage(language ?? "plaintext");
  const lineCount = code === "" ? 0 : code.split("\n").length;

  return (
    <div>
      <Editor
        height={height}
        language={monacoLanguage}
        value={code}
        onChange={onChange}
        theme="gocode-dark"
        beforeMount={defineGoCodeTheme}
        onMount={handleMount}
        options={{
          fontSize,
          lineHeight: Math.round(fontSize * 1.6),
          fontFamily:
            "'JetBrains Mono', 'Fira Code', Menlo, Consolas, 'Courier New', monospace",
          fontLigatures: true,
          padding: { top: 14 },
          minimap: { enabled: false },
          wordWrap: wordWrap ? "on" : "off",
          smoothScrolling: true,
          cursorBlinking: "smooth",
          cursorSmoothCaretAnimation: "on",
          renderLineHighlight: "all",
          bracketPairColorization: { enabled: true },
          guides: { bracketPairs: true, highlightActiveBracketPair: true },
          renderWhitespace: "selection",
        scrollbar: {
          verticalScrollbarSize: 10,
          horizontalScrollbarSize: 10,
          // Không nuốt cuộn chuột khi editor hết nội dung để cuộn:
          // cho phép cuộn tiếp trang web phía ngoài.
          alwaysConsumeMouseWheel: false,
        },
          stickyScroll: { enabled: true },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          autoIndent: "full",
          quickSuggestions: true,
          suggestOnTriggerCharacters: true,
          wordBasedSuggestions: "currentDocument",
          acceptSuggestionOnEnter: "on",
          tabSize: 4,
          insertSpaces: true,
          fixedOverflowWidgets: true,
        }}
      />
      <div className="flex items-center justify-between gap-2 border-t border-white/10 bg-black/40 px-3 py-1.5 font-mono text-[11px] text-zinc-500">
        <div className="flex min-w-0 items-center gap-3">
          <span className="tabular-nums">
            Ln {cursor.line}, Col {cursor.column}
          </span>
          <span className="hidden tabular-nums sm:inline">
            {lineCount} dòng • {code.length} ký tự
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <span className="mr-1.5 hidden text-zinc-600 lg:inline">
            Ctrl+Enter để chạy
          </span>
          <button
            type="button"
            title="Giảm cỡ chữ"
            onClick={() => setFontSize((size) => Math.max(12, size - 1))}
            className="rounded p-1.5 transition hover:bg-white/10 hover:text-zinc-300"
          >
            <Minus className="size-3.5" />
          </button>
          <span className="w-6 text-center tabular-nums">{fontSize}</span>
          <button
            type="button"
            title="Tăng cỡ chữ"
            onClick={() => setFontSize((size) => Math.min(20, size + 1))}
            className="rounded p-1.5 transition hover:bg-white/10 hover:text-zinc-300"
          >
            <Plus className="size-3.5" />
          </button>
          <button
            type="button"
            title={wordWrap ? "Tắt xuống dòng" : "Bật xuống dòng"}
            onClick={() => setWordWrap((wrap) => !wrap)}
            className={`rounded p-1.5 transition hover:bg-white/10 hover:text-zinc-300 ${
              wordWrap ? "text-emerald-400" : ""
            }`}
          >
            <WrapText className="size-3.5" />
          </button>
          <button
            type="button"
            title="Sao chép code"
            onClick={handleCopy}
            className="rounded p-1.5 transition hover:bg-white/10 hover:text-zinc-300"
          >
            {copied ? (
              <Check className="size-3.5 text-emerald-400" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </button>
          <span className="ml-1 hidden rounded bg-white/5 px-1.5 py-0.5 uppercase sm:inline">
            {monacoLanguage}
          </span>
        </div>
      </div>
    </div>
  );
}
