import React, { useCallback, useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { axiosInstance } from "./lib/axios";
import LetterGlitch from "./components/LetterGlitch";


type Issue = {
  line: number;
  severity?: "critical" | "warning" | "info" | string;
  issue: string;
  suggestion?: string;
};

type FeedbackResponse = {
  analysis?: string;
  improved_code?: string;
  // fallback keys
  response?: string;
  improvedCode?: string;
};

type AnnotateResponse = {
  issues?: Issue[];
  improved_code?: string;
  improvedCode?: string;
};

function debounce<T extends (...args: any[]) => void>(fn: T, delay = 800) {
  let t: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...(args as any)), delay);
  };
}

export default function App() {
  const editorRef = useRef<any | null>(null);
  const monacoRef = useRef<any | null>(null);
  const decorationsRef = useRef<string[]>([]);

  const [code, setCode] = useState<string>("# write your code here\n");
  const [language, setLanguage] = useState<"python" | "javascript" | "cpp">("python");
  const [result, setResult] = useState<string>("");
  const [feedback, setFeedback] = useState<string>("");
  const [issuesList, setIssuesList] = useState<Issue[]>([]);
  const [suggestedFix, setSuggestedFix] = useState<string>("");

  const [runLoading, setRunLoading] = useState<boolean>(false);
  const [feedLoading, setFeedLoading] = useState<boolean>(false);
  const [annotateLoading, setAnnotateLoading] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string>("");

  const handleEditorMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    editor.updateOptions({ glyphMargin: true, automaticLayout: true });
  };

  const applyDecorations = useCallback((issues: Issue[]) => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    const newDecorations = issues.map((iss) => {
      const startLine = Math.max(1, iss.line || 1);
      const severity = (iss.severity || "info").toLowerCase();

      const className =
        severity === "critical"
          ? "lint-line-critical"
          : severity === "warning"
          ? "lint-line-warning"
          : "lint-line-info";

      const glyphClass =
        severity === "critical"
          ? "lint-glyph-critical"
          : severity === "warning"
          ? "lint-glyph-warning"
          : "lint-glyph-info";

      return {
        range: new monaco.Range(startLine, 1, startLine, 1),
        options: {
          isWholeLine: false,
          className,
          glyphMarginClassName: glyphClass,
          hoverMessage: {
            value: `**${severity.toUpperCase()}**: ${iss.issue}\n\n${iss.suggestion || ""}`,
          },
        },
      };
    });

    try {
      const applied = editor.deltaDecorations(decorationsRef.current, newDecorations);
      decorationsRef.current = applied;
    } catch (e) {
      console.warn("decoration apply failed", e);
    }
  }, []);

  async function runCode() {
    setRunLoading(true);
    setResult("");
    setStatusMsg("Running...");
    try {
      const res = await axiosInstance.post("/run", { code, language });
      setResult(res.data.output || res.data.error || "No output");
      setStatusMsg("Run finished");
    } catch (err) {
      setResult("Server error: cannot execute code");
      setStatusMsg("Run failed");
    } finally {
      setRunLoading(false);
      setTimeout(() => setStatusMsg(""), 1500);
    }
  }

  async function getFeedback() {
    setFeedLoading(true);
    setFeedback("");
    setSuggestedFix("");
    setStatusMsg("Requesting AI feedback...");
    try {
      const res = await axiosInstance.post<FeedbackResponse>("/feedback", { code, language });
      const data = res.data || {};
      const analysis = data.analysis || data.response || data as any;
      const improved = data.improved_code || data.improvedCode || "";
      setFeedback(typeof analysis === "string" ? analysis : JSON.stringify(analysis, null, 2));
      if (improved && improved.trim()) setSuggestedFix(improved);
      setStatusMsg("Feedback ready");
    } catch (err) {
      setFeedback("Server error: cannot get feedback");
      setStatusMsg("Feedback failed");
    } finally {
      setFeedLoading(false);
      setTimeout(() => setStatusMsg(""), 1500);
    }
  }

  function applyFix() {
    if (!suggestedFix) return;
    setCode(suggestedFix);
    if (editorRef.current) editorRef.current.setValue(suggestedFix);
    setIssuesList([]);
    applyDecorations([]);
    setSuggestedFix("");
    setStatusMsg("Applied suggested fix");
    setTimeout(() => setStatusMsg(""), 1200);
  }

  async function annotateCode(localCode?: string) {
    const payloadCode = localCode !== undefined ? localCode : code;
    setAnnotateLoading(true);
    setStatusMsg("Analyzing...");
    try {
      const res = await axiosInstance.post<AnnotateResponse>("/annotate", {
        code: payloadCode,
        language,
      });
      const data = res.data || {};
      const issues = data.issues || [];
      setIssuesList(issues);
      applyDecorations(issues);
      const improved = data.improved_code || data.improvedCode || "";
      if (improved) setSuggestedFix(improved);
      setStatusMsg("Analysis ready");
    } catch (err) {
      console.warn("annotate error", err);
      setIssuesList([]);
      applyDecorations([]);
      setStatusMsg("Analysis failed");
    } finally {
      setAnnotateLoading(false);
      setTimeout(() => setStatusMsg(""), 1200);
    }
  }

  const debouncedAnnotate = useRef(debounce((latestCode: string) => annotateCode(latestCode), 1200)).current;

  function handleEditorChange(value?: string | null) {
    const v = value ?? "";
    setCode(v);
    debouncedAnnotate(v);
  }

  function jumpToLine(line: number) {
    const ed = editorRef.current;
    if (!ed) return;
    try {
      ed.revealLineInCenter(line);
      ed.setPosition({ lineNumber: line, column: 1 });
      ed.focus();
    } catch (e) {
      console.warn("jump error", e);
    }
  }

  function handleLanguageChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const lang = e.target.value as "python" | "javascript" | "cpp";
    setLanguage(lang);

    if (monacoRef.current && editorRef.current) {
      try {
        const monaco = monacoRef.current;
        const model = editorRef.current.getModel();
        if (model) {
          const monacoLang = lang === "javascript" ? "javascript" : lang === "cpp" ? "cpp" : "python";
          monaco.editor.setModelLanguage(model, monacoLang);
        }
      } catch (e) {
      }
    }
    annotateCode(code);
  }

  useEffect(() => {
    annotateCode();
  }, []);


  return (
    <div className="relative w-full h-screen bg-black text-white overflow-hidden">
      <div className="absolute inset-0 z-0 pointer-events-none opacity-20 scale-110">
        <LetterGlitch
          glitchColors={["#2b4539", "#61dca3", "#61b3dc"]}
          glitchSpeed={50}
          centerVignette={false}
          outerVignette={true}
          smooth={true}
          characters="ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$&*()-_+=/[]{};:<>.,0123456789"
        />
      </div>

      <div className="relative z-20 flex gap-6 p-6 h-full">
        <div className="w-1/2 flex flex-col">
          <div className="flex items-center gap-3 mb-3">
            <select
              value={language}
              onChange={handleLanguageChange}
              className="text-white px-2 py-1 rounded focus:outline-none border-2 p-2 border-blue-800"
            >
              <option value="python">Python</option>
              <option value="javascript">JavaScript</option>
              <option value="cpp">C++</option>
            </select>

            <button
              onClick={runCode}
              disabled={!code.trim() || runLoading}
              className="px-4 py-2 rounded bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white"
            >
              {runLoading ? "Running..." : "Run"}
            </button>

            <button
              onClick={getFeedback}
              disabled={!code.trim() || feedLoading}
              className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white"
            >
              {feedLoading ? "Getting feedback..." : "Get Feedback"}
            </button>

            <button
              onClick={() => annotateCode()}
              disabled={!code.trim() || annotateLoading}
              className="px-4 py-2 rounded bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 text-white"
            >
              {annotateLoading ? "Analyzing..." : "Analyze"}
            </button>

            <div className="ml-auto text-sm text-gray-300">{statusMsg}</div>
          </div>

          <div className="flex-1 border border-gray-700 rounded overflow-hidden">
            <Editor
              height="55vh"
              defaultLanguage={language}
              theme="vs-dark"
              value={code}
              onChange={handleEditorChange}
              onMount={(editor, monaco) => {
                monacoRef.current = monaco;
                handleEditorMount(editor, monaco);
              }}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                automaticLayout: true,
              }}
            />
          </div>

          {suggestedFix ? (
            <div className="mt-3 flex gap-3">
              <button
                onClick={applyFix}
                className="px-4 py-2 rounded bg-purple-600 hover:bg-purple-700 text-white"
              >
                Apply Suggested Fix
              </button>

              <button
                onClick={() => setFeedback(suggestedFix)}
                className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white"
              >
                Preview Fix
              </button>
            </div>
          ) : null}
        </div>

        <div className="w-1/2 flex flex-col gap-4">
          <div className="h-1/3 overflow-auto bg-black/70 border border-gray-700 rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-red-500 font-semibold">Issues</h2>
              <div className="text-sm text-gray-300">{issuesList.length} found</div>
            </div>

            {issuesList.length === 0 ? (
              <div className="text-gray-400">No issues found.</div>
            ) : (
              issuesList.map((iss, idx) => (
                <div
                  key={idx}
                  onClick={() => jumpToLine(iss.line)}
                  className="cursor-pointer hover:bg-gray-800 p-2 rounded mb-1"
                >
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        iss.severity === "critical"
                          ? "bg-red-600"
                          : iss.severity === "warning"
                          ? "bg-yellow-400 text-black"
                          : "bg-sky-600"
                      }`}
                    >
                      {iss.severity?.toUpperCase() || "INFO"}
                    </span>
                    <strong className="ml-1">Line {iss.line}</strong>
                  </div>
                  <div className="text-sm text-gray-300 mt-1">{iss.issue}</div>
                  {iss.suggestion && <div className="text-xs text-gray-500 mt-1">→ {iss.suggestion}</div>}
                </div>
              ))
            )}
          </div>

          <div className="h-1/3 overflow-auto bg-black/70 border border-gray-700 rounded p-4 text-green-400 whitespace-pre-wrap">
            <h1 className="text-red-600 mb-2 font-semibold">Feedback</h1>
            <div className="text-sm text-green-200">{feedback || "AI Feedback will appear here..."}</div>
          </div>

          <div className="h-1/3 overflow-auto bg-black/70 border border-gray-700 rounded p-4 text-green-400 whitespace-pre-wrap">
            <h1 className="text-red-600 mb-2 font-semibold">Output</h1>
            <div className="text-sm text-green-200">{result || "Program output will appear here..."}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
