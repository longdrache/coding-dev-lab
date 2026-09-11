"use client";
import Editor from "@monaco-editor/react";

function getMonacoLanguage(language: string) {
  const normalizedLanguage = language.toLowerCase();

  if (normalizedLanguage.startsWith("python")) return "python";
  if (normalizedLanguage.startsWith("javascript")) return "javascript";
  if (normalizedLanguage.startsWith("c++")) return "cpp";

  return normalizedLanguage;
}

export default function CodeEditor({
  code,
  language,
  onChange,
}: {
  code: string;
  language?: string;
  onChange?: (value?: string) => void;
}) {
  return (
    <Editor
      height="60vh"
      language={getMonacoLanguage(language ?? "plaintext")}
      value={code}
      onChange={onChange}
      theme="vs-white"
      options={{
        fontSize: 14,
        automaticLayout: true,
        scrollBeyondLastLine: false,
        autoIndent: "full",
        quickSuggestions: true,
        suggestOnTriggerCharacters: true,
        wordBasedSuggestions: "currentDocument",
        acceptSuggestionOnEnter: "on",
        tabSize: 4, // Python convention
        insertSpaces: true, // dùng spaces thay vì tab
      }}
    />
  );
}
