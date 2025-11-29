import Editor from "@monaco-editor/react";
import { useState } from "react";
import { axiosInstance } from "./lib/axios";
import LetterGlitch from "./components/LetterGlitch";

function App() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState("");
  const [runLoading, setRunLoading] = useState(false);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedback, setFeedback] = useState<string>("");

  async function runCode() {
    try {
      setRunLoading(true);
      const res = await axiosInstance.post("/run", { code });
      setResult(res.data.output || res.data.error);
    } catch {
      setResult("Server error: cannot execute code");
    } finally {
      setRunLoading(false);
    }
  }

  async function getFeedback() {
    try {
      setFeedLoading(true);
      const res = await axiosInstance.post("/feedback", { code });
      setFeedback(res.data.response);
    } catch {
      setFeedback("Server error: cannot get feedback");
    } finally {
      setFeedLoading(false);
    }
  }

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">

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

        <div className="w-[50%] flex flex-col">
          <Editor
            height="55vh"
            defaultLanguage="python"
            theme="vs-dark"
            value={code}
            onChange={(value) => setCode(value ?? "")}
          />

          <div className="flex gap-3 mt-4">
            <button
              disabled={!code.trim() || runLoading}
              onClick={runCode}
              className="px-4 py-2 rounded bg-green-600 hover:bg-green-700 disabled:bg-gray-600"
            >
              {runLoading ? "Running..." : "Run"}
            </button>

            <button
              disabled={!code.trim() || feedLoading}
              onClick={getFeedback}
              className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600"
            >
              {feedLoading ? "Getting feedback..." : "Get Feedback"}
            </button>
          </div>
        </div>

        <div className="w-[50%] flex flex-col gap-4">

          <div className="h-[45vh] overflow-auto bg-black/70 border border-gray-700 rounded p-4 text-green-400 whitespace-pre-wrap">
            <h1 className="text-red-600 mb-2">Feedback</h1>
            {feedback || "AI Feedback will appear here..."}
          </div>

          <pre className="h-[45vh] overflow-auto bg-black/70 border border-gray-700 rounded p-4 text-green-400 whitespace-pre-wrap">
            <h1 className="text-red-600 mb-2">Output</h1>
            {result || "Program output will appear here..."}
          </pre>
        </div>
      </div>
    </div>
  );
}

export default App;
