import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";

const envLines = fs.readFileSync(".env.local", "utf-8").split("\n");
const envConfig: Record<string, string> = {};
for (const line of envLines) {
  const parts = line.trim().split("=");
  if (parts.length >= 2) {
    envConfig[parts[0].trim()] = parts.slice(1).join("=").trim();
  }
}

const supabaseAnon = createClient(envConfig.VITE_SUPABASE_URL, envConfig.VITE_SUPABASE_ANON_KEY);

async function testLogins() {
  console.log("=== TESTING LOGIN BY NIS & 2-WORD USERNAME ===");

  const testCases = [
    { label: "Darra Anugrah (NIS)", input: "262710273" },
    { label: "Darra Anugrah (2-Word Username)", input: "darraanugrah" },
    { label: "Nabilla Rhania (2-Word Username)", input: "nabillarhania" },
    { label: "Adelio Liviano (2-Word Username)", input: "adelioliviano" },
    { label: "Aira Putri (2-Word Username)", input: "airaputri" },
  ];

  for (const tc of testCases) {
    // 1. Test RPC resolve_login
    const { data: resolvedNis, error: rpcErr } = await supabaseAnon.rpc("resolve_login", {
      p_login: tc.input,
    });

    if (rpcErr) {
      console.error(`[FAIL RPC] ${tc.label} (${tc.input}):`, rpcErr.message);
      continue;
    }

    const emailToAuth = `${resolvedNis}@sman19.sch.id`;

    // 2. Test Supabase Auth signInWithPassword with password 'murid19*'
    const { data: authData, error: authErr } = await supabaseAnon.auth.signInWithPassword({
      email: emailToAuth,
      password: "murid19*",
    });

    if (authErr) {
      console.error(`[FAIL AUTH] ${tc.label} (${emailToAuth}):`, authErr.message);
    } else if (authData.user) {
      // 3. Fetch profile
      const { data: prof } = await supabaseAnon.from("profiles").select("*").eq("id", authData.user.id).single();
      console.log(`✅ [SUCCESS] ${tc.label}: Input "${tc.input}" -> NIS: ${resolvedNis} -> User: "${prof?.nama}" (Kelas: ${prof?.nis})`);
    }
  }
}

testLogins().catch(console.error);
