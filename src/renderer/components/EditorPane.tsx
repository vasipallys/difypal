import Editor, { loader, type Monaco, type OnMount } from '@monaco-editor/react'
import { Braces, WandSparkles } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { editor } from 'monaco-editor'
import * as localMonaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import { formatDsl } from '@/core/dsl/parser'
import { useWorkspace } from '@/renderer/stores/workspace'

self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
}
loader.config({ monaco: localMonaco as typeof import('monaco-editor') })

export function EditorPane() {
  const { content, validation, set } = useWorkspace()
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<Monaco | null>(null)

  const onMount: OnMount = (instance, monaco) => {
    editorRef.current = instance
    monacoRef.current = monaco
  }

  useEffect(() => {
    const monaco = monacoRef.current
    const model = editorRef.current?.getModel()
    if (!monaco || !model)
      return
    monaco.editor.setModelMarkers(model, 'dify-dsl-studio', (validation?.issues ?? [])
      .filter(issue => issue.severity === 'error')
      .slice(0, 100)
      .map((issue, index) => ({
        startLineNumber: Math.min(index + 1, model.getLineCount()),
        startColumn: 1,
        endLineNumber: Math.min(index + 1, model.getLineCount()),
        endColumn: model.getLineMaxColumn(Math.min(index + 1, model.getLineCount())),
        message: `${issue.code}: ${issue.message}${issue.path ? `\n${issue.path}` : ''}`,
        severity: monaco.MarkerSeverity.Error,
      })))
  }, [validation])

  const format = () => {
    try {
      set({ content: formatDsl(content), notice: 'YAML formatted.' })
    }
    catch (error) {
      set({ notice: error instanceof Error ? error.message : 'Could not format YAML.' })
    }
  }

  return (
    <section className="editor-shell">
      <div className="panel-toolbar">
        <div><Braces size={15} /> YAML / Dify DSL 0.6.0</div>
        <button className="button tiny" onClick={format}><WandSparkles size={14} /> Format YAML</button>
      </div>
      <Editor
        height="100%"
        language="yaml"
        theme="vs-dark"
        value={content}
        onChange={value => set({ content: value ?? '' })}
        onMount={onMount}
        options={{
          automaticLayout: true,
          minimap: { enabled: false },
          fontSize: 13,
          lineHeight: 21,
          padding: { top: 14 },
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          tabSize: 2,
          insertSpaces: true,
          formatOnPaste: true,
          quickSuggestions: true,
        }}
      />
    </section>
  )
}
