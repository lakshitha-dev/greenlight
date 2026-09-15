/** Does GreenLight have a working Anthropic credential?
 *
 *  Run:  npm run check:ai
 *
 *  Makes one tiny real request and reports what happened. Never prints the
 *  credential, only which variable it came from and whether the API accepted
 *  it — so this is safe to run and safe to paste the output of.
 */

import Anthropic from "@anthropic-ai/sdk";
import { credentialKind } from "../lib/sources/claude";

const SOURCE: Record<string, string> = {
  "api-key": "ANTHROPIC_API_KEY (direct to Anthropic)",
  "vercel-gateway": "Vercel AI Gateway (VERCEL_OIDC_TOKEN / AI_GATEWAY_API_KEY)",
  "oauth-token": "ANTHROPIC_AUTH_TOKEN",
  none: "nothing",
};

async function main() {
  const kind = credentialKind();
  console.log(`credential found : ${SOURCE[kind]}`);

  if (kind === "none") {
    console.log(`
No credential is set, so "Research this software" will run the four keyless
security sources and record every compliance field as "not found".

That is correct behaviour, not a failure — but SOC 2, DPA, residency, SSO tier
and pricing will stay empty, and requests will land on "More information
required" because two of those are blocking requirements.

To fix, get a key from https://console.anthropic.com/settings/keys and add it
to .env:

  ANTHROPIC_API_KEY=sk-ant-api...
`);
    process.exit(1);
  }

  if (kind === "oauth-token") {
    console.log(
      "note             : this is an OAuth token, which is issued for the Claude Code\n" +
        "                   CLI against a personal subscription. Testing whether the API\n" +
        "                   accepts it for application use."
    );
  }

  process.stdout.write("\ncalling the API   ... ");

  try {
    const viaGateway = kind === "vercel-gateway";
    const client = viaGateway
      ? new Anthropic({
          baseURL: "https://ai-gateway.vercel.sh",
          apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.VERCEL_OIDC_TOKEN ?? "",
        })
      : new Anthropic();
    const res = await client.messages.create({
      model: viaGateway ? "anthropic/claude-opus-5" : "claude-opus-5",
      max_tokens: 16,
      messages: [{ role: "user", content: "Reply with the single word: ready" }],
    });

    const text = res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();

    console.log("accepted");
    console.log(`model replied    : "${text}"`);
    console.log(`tokens           : ${res.usage.input_tokens} in, ${res.usage.output_tokens} out`);
    console.log(`
The synthesis layer will run. "Research this software" will now look for SOC 2,
ISO 27001, DPA, sub-processor lists, data residency, SSO tier and pricing, and
attach a source to each.
`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log("REFUSED");
    console.log(`\nthe API said     : ${msg.slice(0, 300)}`);

    if (kind === "oauth-token") {
      console.log(`
An OAuth token is issued for the Claude Code CLI, not for backing an
application, so this outcome is the expected one. Get an API key from
https://console.anthropic.com/settings/keys and set ANTHROPIC_API_KEY instead.
`);
    }
    process.exit(1);
  }
}

main();
