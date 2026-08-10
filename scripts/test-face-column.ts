import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const envLocal = fs.readFileSync(".env.local", "utf-8");
let url = "";
let key = "";
for (const line of envLocal.split("\n")) {
  if (line.startsWith("VITE_SUPABASE_URL=")) url = line.split("=")[1].trim();
  if (line.startsWith("VITE_SUPABASE_ANON_KEY=")) key = line.split("=")[1].trim();
}

const supabase = createClient(url, key);

async function test() {
  const { data, error } = await supabase.from("siswa").select("id, nama, nis, foto_url, face_embedding").limit(3);
  if (error) {
    console.error("Error querying face_embedding:", error.message);
  } else {
    console.log("Successfully queried siswa with face_embedding column:", data);
  }
}
test();
