from fastapi import FastAPI
from pydantic import BaseModel
import subprocess, uuid, os, json
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

load_dotenv()

os.environ['GROQ_API_KEY'] = os.getenv("GROQ_API_KEY")
API_BASE_URL = os.getenv("API_BASE_URL")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[API_BASE_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

LANG_CONFIG = {
    "python": {
        "ext": ".py",
        "run_cmd": lambda f: ["python3", f"/home/runner/{f}"]
    },
    "javascript": {
        "ext": ".js",
        "run_cmd": lambda f: ["node", f"/home/runner/{f}"]
    },
    "cpp": {
        "ext": ".cpp",
        "compiler_cmd": lambda f: ["g++", f"/home/runner/{f}", "-o", f"/home/runner/a.out"],
        "run_cmd": lambda f: [f"/home/runner/a.out"]
    }
}

class CodeRequest(BaseModel):
    code: str
    language: str

os.makedirs("sandbox", exist_ok=True)

def run_in_sandbox(code, language):
    if language not in LANG_CONFIG:
        return "", f"Unsupported language: {language}"
    
    cfg = LANG_CONFIG[language]
    filename = f"sandbox/{uuid.uuid4().hex}{cfg['ext']}"
    with open(filename, "w") as f:
        f.write(code)
    
    try:
        if "compiler_cmd" in cfg:
            compile_result = subprocess.run(
                ["docker", "run", "--rm",
                 "-v", f"{os.getcwd()}/sandbox:/home/runner",
                 "lintx-image"] + cfg["compiler_cmd"](os.path.basename(filename)),
                capture_output=True,
                text=True,
                timeout=10
            )
            if compile_result.returncode != 0:
                return "", compile_result.stderr

        result = subprocess.run(
            ["docker", "run", "--rm",
             "-v", f"{os.getcwd()}/sandbox:/home/runner",
             "lintx-image"] + cfg["run_cmd"](os.path.basename(filename)),
            capture_output=True,
            text=True,
            timeout=5
        )

        output = result.stdout
        error = result.stderr
    
    except subprocess.TimeoutExpired:
        output = ""
        error = "Execution timed out"
    finally:
        if os.path.exists(filename):
            os.remove(filename)

    return output, error

@app.post("/api/run")
async def run_code(payload: CodeRequest):
    code = payload.code
    language = payload.language

    output, error = run_in_sandbox(code, language)

    return {"output": output, "error": error}


groq_chat = ChatGroq(
        temperature=0,
        model_name="openai/gpt-oss-20b"
    )


@app.post("/api/feedback")
def feedback(payload: CodeRequest):
    code = payload.code
    language = payload.language

    output, error = run_in_sandbox(code, language)


    template = """
You are a senior software engineer analyzing code.

Code:
{code}

Execution stdout:
{output}

Execution stderr:
{error}

Now return JSON ONLY with keys:
{{
  "analysis": "summary of bugs",
  "improved_code": "rewritten optimized version"
}}
"""

    prompt = ChatPromptTemplate.from_template(template)
    chain = prompt | groq_chat | StrOutputParser()

    response = chain.invoke({
        "code": code,
        "output": output,
        "error": error
    })

    try:
        parsed = json.loads(response)
    except:
        parsed = {"analysis": response, "improved_code": ""}

    return parsed


@app.post("/api/annotate")
async def annotate(data: CodeRequest):
    template = """
You are a static analyzer.

Return STRICT JSON with:
{{
  "issues": [
    {{
      "line": number,
      "severity": "critical | warning | info",
      "issue": "short description",
      "suggestion": "short fix"
    }}
  ],
  "improved_code": "fixed version of code"
}}

Analyze this code:
{code}
"""


    prompt = ChatPromptTemplate.from_template(template)
    chain = prompt | groq_chat | StrOutputParser()
    response = chain.invoke({"code": data.code})

    try:
        parsed = json.loads(response)
    except:
        parsed = {"issues": [], "improved_code": data.code}

    return parsed
