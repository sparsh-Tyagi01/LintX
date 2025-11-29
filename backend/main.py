from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import subprocess, uuid, os
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

load_dotenv()

os.environ['GROQ_API_KEY'] = os.getenv("GROQ_API_KEY")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CodeRequest(BaseModel):
    code: str

os.makedirs("sandbox", exist_ok=True)

@app.post("/api/run")
async def run_code(payload: CodeRequest):
    code = payload.code

    filename = f"sandbox/{uuid.uuid4().hex}.py"
    with open(filename, "w") as f:
        f.write(code)

    try:
        result = subprocess.run(
            [
                "docker", "run", "--rm",
                "-v", f"{os.getcwd()}/sandbox:/home/runner",
                "lintx-image",
                "python3", f"/home/runner/{os.path.basename(filename)}"
            ],
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

    return {"output": output, "error": error}


@app.post("/api/feedback")
def feedback(payload: CodeRequest):
    code = payload.code

    filename = f"sandbox/{uuid.uuid4().hex}.py"
    with open(filename, "w") as f:
        f.write(code)

    try:
        result = subprocess.run(
            [
                "docker", "run", "--rm",
                "-v", f"{os.getcwd()}/sandbox:/home/runner",
                "lintx-image",
                "python3", f"/home/runner/{os.path.basename(filename)}"
            ],
            capture_output=True,
            text=True,
            timeout=10
        )

        output = result.stdout
        error = result.stderr

    except subprocess.TimeoutExpired:
        output = ""
        error = "Execution timed out"

    finally:
        if os.path.exists(filename):
            os.remove(filename)

    groq_chat = ChatGroq(
        temperature=0,
        model_name="openai/gpt-oss-20b"
    )

    template = """
You're a senior software engineer.

Here is the code:
{code}

Execution stdout:
{output}

Execution stderr:
{error}

Now give:
1. Bug analysis  
2. Fix explanation  
3. Improved code (rewrite optimized version)
"""

    prompt = ChatPromptTemplate.from_template(template)
    chain = prompt | groq_chat | StrOutputParser()

    response = chain.invoke({
        "code": code,
        "output": output,
        "error": error
    })

    return {"response": response}
