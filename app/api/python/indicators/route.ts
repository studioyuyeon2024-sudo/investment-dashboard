import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  ticker: z.string().regex(/^[0-9A-Z]{6}$/),
  days: z.number().int().min(20).max(365).default(120),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "잘못된 입력" },
      { status: 400 },
    );
  }

  try {
    const output = await runPython(
      "scripts/python/indicators.py",
      JSON.stringify(parsed.data),
    );
    return NextResponse.json(JSON.parse(output));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Python 실행 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function runPython(scriptRelPath: string, stdinInput: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const script = path.join(
      /*turbopackIgnore: true*/ process.cwd(),
      scriptRelPath,
    );
    const pythonBin = process.env.PYTHON_BIN ?? "python";
    const child = spawn(pythonBin, [script], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`python exit ${code}: ${stderr}`));
    });

    child.stdin.write(stdinInput);
    child.stdin.end();
  });
}
