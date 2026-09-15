import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { handler, fail } from "@/lib/api";

/** Serves a skill file for download. The name is a path segment supplied by
 *  the caller, so it is matched against a strict pattern rather than joined
 *  straight onto a path — "../../.env" is a directory traversal, not a skill. */
export const GET = handler("skill download", async (_req: Request, ctx: unknown) => {
  const { params } = ctx as { params: Promise<{ name: string }> };
  const { name } = await params;

  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(name))
    return fail(400, "Not a valid skill name.");

  let body: string;
  try {
    body = readFileSync(join(process.cwd(), "skills", name, "SKILL.md"), "utf8");
  } catch {
    return fail(404, `No skill named ${name}.`);
  }

  return new NextResponse(body, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${name}.md"`,
    },
  });
});
