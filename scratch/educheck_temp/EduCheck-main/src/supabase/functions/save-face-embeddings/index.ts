import { serve } from 'std/http/server.ts';
import { createClient } from 'supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmbeddingData {
  studentId: string;
  nis: string;
  embedding: string;
}

interface RequestBody {
  classId: string;
  embeddings: EmbeddingData[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: RequestBody = await req.json();
    const { classId, embeddings } = body;

    if (!classId || !embeddings || !Array.isArray(embeddings)) {
      return new Response(
        JSON.stringify({ error: 'Invalid request body' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const results = {
      success: 0,
      failed: 0,
      details: [] as Array<{ nis: string; status: 'success' | 'failed'; reason?: string }>,
    };

    for (const data of embeddings) {
      try {
        const { error } = await supabase
          .from('students')
          .update({ face_embedding: data.embedding })
          .eq('id', data.studentId)
          .eq('classId', classId);

        if (error) {
          throw error;
        }

        results.success++;
        results.details.push({ nis: data.nis, status: 'success' });
      } catch (err) {
        results.failed++;
        results.details.push({ 
          nis: data.nis, 
          status: 'failed',
          reason: err.message 
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: results.success,
        failed: results.failed,
        details: results.details,
        message: `Berhasil: ${results.success}, Gagal: ${results.failed}`,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
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