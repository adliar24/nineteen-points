import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProcessResult {
  success: number;
  failed: number;
  details: Array<{
    nis: string;
    status: 'success' | 'failed';
    reason?: string;
  }>;
  message?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const formData = await req.formData();
    const zipFile = formData.get('zip') as File | null;
    const classId = formData.get('classId') as string | null;

    if (!zipFile || !classId) {
      return new Response(
        JSON.stringify({ error: 'File ZIP dan classId wajib diisi' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const arrayBuffer = await zipFile.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const zip = await unzipZip(uint8Array);
    
    const imageFiles = Object.keys(zip).filter((filename) => 
      filename.match(/\.(jpg|jpeg|png)$/i)
    );

    if (imageFiles.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Tidak ditemukan foto dalam file ZIP' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: students, error: studentsError } = await supabase
      .from('students')
      .select('id, name')
      .eq('classId', classId);

    if (studentsError) {
      throw studentsError;
    }

    const studentMap = new Map<string, string>();
    students?.forEach((s) => {
      studentMap.set(s.id.toLowerCase(), s.id);
      studentMap.set(s.name.toLowerCase(), s.id);
    });

    const result: ProcessResult = {
      success: 0,
      failed: 0,
      details: [],
    };

    for (const filename of imageFiles) {
      const baseName = filename.replace(/\.(jpg|jpeg|png)$/i, '').toLowerCase();
      const studentId = studentMap.get(baseName) || findStudentByMatch(studentMap, baseName);

      if (!studentId) {
        result.details.push({
          nis: baseName,
          status: 'failed',
          reason: 'Siswa tidak ditemukan',
        });
        result.failed++;
        continue;
      }

      try {
        const imageData = zip[filename];
        const embedding = await computeFaceEmbedding(imageData);

        if (!embedding) {
          result.details.push({
            nis: baseName,
            status: 'failed',
            reason: 'Wajah tidak terdeteksi',
          });
          result.failed++;
          continue;
        }

        const embeddingStr = Array.from(embedding).join(',');

        const { error: updateError } = await supabase
          .from('students')
          .update({ face_embedding: embeddingStr })
          .eq('id', studentId);

        if (updateError) {
          throw updateError;
        }

        result.details.push({
          nis: baseName,
          status: 'success',
        });
        result.success++;
      } catch (err) {
        result.details.push({
          nis: baseName,
          status: 'failed',
          reason: `Error: ${err.message}`,
        });
        result.failed++;
      }
    }

    result.message = `Pemrosesan selesai: ${result.success} berhasil, ${result.failed} gagal`;

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function findStudentByMatch(studentMap: Map<string, string>, nis: string): string | null {
  for (const [key, value] of studentMap) {
    if (nis.includes(key) || key.includes(nis)) {
      return value;
    }
  }
  return null;
}

async function unzipZip(data: Uint8Array): Promise<Record<string, Uint8Array>> {
  const decoder = new TextDecoder();
  const files: Record<string, Uint8Array> = {};

  const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
  
  if (data[0] !== ZIP_SIGNATURE[0] || data[1] !== ZIP_SIGNATURE[1]) {
    throw new Error('Invalid ZIP file');
  }

  let offset = 0;
  const totalSize = data.length;

  while (offset < totalSize - 22) {
    if (data[offset] !== 0x50 || data[offset + 1] !== 0x4b) {
      offset++;
      continue;
    }

    const signature = data.slice(offset, offset + 4);
    if (signature[0] === 0x50 && signature[1] === 0x4b && signature[2] === 0x03 && signature[3] === 0x04) {
      const compressedSize = data[offset + 18] | (data[offset + 19] << 8) | (data[offset + 20] << 16) | (data[offset + 21] << 24);
      const uncompressedSize = data[offset + 22] | (data[offset + 23] << 8) | (data[offset + 24] << 16) | (data[offset + 25] << 24);
      const nameLength = data[offset + 26] | (data[offset + 27] << 8);
      const extraLength = data[offset + 28] | (data[offset + 29] << 8);
      
      const nameBytes = data.slice(offset + 30, offset + 30 + nameLength);
      const filename = decoder.decode(nameBytes);
      
      const dataStart = offset + 30 + nameLength + extraLength;
      const compressedData = data.slice(dataStart, dataStart + compressedSize);
      
      files[filename] = compressedData;
      
      offset = dataStart + compressedSize;
    } else {
      offset++;
    }
  }

  return files;
}

async function computeFaceEmbedding(imageData: Uint8Array): Promise<Float32Array | null> {
  try {
    const base64 = uint8ArrayToBase64(imageData);
    const imageUrl = `data:image/jpeg;base64,${base64}`;
    
    const response = await fetch('https://api.bfl.huggingface.co/face-embedding', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ image: imageUrl }),
    });

    if (!response.ok) {
      return null;
    }

    const result = await response.json();
    if (result && result.embedding) {
      return new Float32Array(result.embedding);
    }

    return null;
  } catch (error) {
    console.error('Error computing face embedding:', error);
    return null;
  }
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}