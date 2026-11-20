import type { Monaco } from "@monaco-editor/react";

export function configureStudioTheme(monaco: Monaco) {
    monaco.editor.defineTheme("studio-dark", {
        base: "vs-dark",
        inherit: true,
        rules: [
            { token: "comment", foreground: "15616d", fontStyle: "italic" },
            { token: "keyword", foreground: "ff7d00", fontStyle: "bold" },
            { token: "identifier", foreground: "ffecd1" },
            { token: "string", foreground: "3ec5da" },
            { token: "number", foreground: "ffb066" },
            { token: "delimiter", foreground: "7ed9e7" },
            { token: "type", foreground: "41b0ff" },
            { token: "tag", foreground: "ff7d00" },
            { token: "attribute.name", foreground: "7ed9e7" },
            { token: "attribute.value", foreground: "3ec5da" },
        ],
        colors: {
            "editor.background": "#000407",
            "editor.foreground": "#ffecd1",
            "editorLineNumber.foreground": "#15616d",
            "editorLineNumber.activeForeground": "#ff7d00",
            "editorCursor.foreground": "#ff7d00",
            "editor.selectionBackground": "#004c8366",
            "editor.inactiveSelectionBackground": "#00152488",
            "editor.lineHighlightBackground": "#00111d66",
            "editorIndentGuide.background1": "#001524",
            "editorIndentGuide.activeBackground1": "#15616d",
            "editorGutter.background": "#000000",
            "editorWidget.background": "#00111d",
            "editorWidget.border": "#15616d",
        },
    });
}
